import OpenAI from "openai";
import { storage } from "./storage";
import type { Message } from "@shared/schema";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY || "default_key"
});

export type FeedbackQueueItem = {
  priority: number;
  type: "improvement" | "strength";
  concept: string;
  target_quote: string;
  issue_description: string;
};

export type NextStrategy = "Ask clarifying question" | "Challenge assumption" | "Move to next item";

export type EvaluateNextMoveResult = {
  is_resolved: boolean;
  user_pushback_detected: boolean;
  next_strategy: NextStrategy;
  strategy_notes: string;
};

function buildLegacyFeedbackStrings(queue: FeedbackQueueItem[]): { strengths: string; improvements: string } {
  const strengthsItems = queue.filter(item => item.type === "strength").slice(0, 2);
  const improvementItems = queue.filter(item => item.type !== "strength").slice(0, 2);

  const formatLine = (item: FeedbackQueueItem) => {
    const quote = item.target_quote ? ` Quote: "${item.target_quote}".` : "";
    return `- ${item.concept}: ${item.issue_description}.${quote}`;
  };

  const strengths = strengthsItems.length > 0
    ? strengthsItems.map(formatLine).join("\n")
    : "No clear strengths were detected in this conversation sample.";

  const improvements = improvementItems.length > 0
    ? improvementItems.map(formatLine).join("\n")
    : "No major improvement areas were detected in this conversation sample.";

  return { strengths, improvements };
}

async function getFeedbackDialogueSystemPrompt(): Promise<string> {
  const teacherPrompt = await storage.getAiPrompt("teacher_role");
  return teacherPrompt?.prompt || `You are a supportive science communication coach providing feedback through dialogue.`;
}

export async function generateTeacherResponse(
  feedbackMessages: Array<{ role: 'student' | 'teacher'; content: string }>,
  feedbackContext: { 
    originalConversation: Array<{ role: string; content: string }>
  },
  executorContext: {
    activeItem: FeedbackQueueItem | null;
    plannerDecision: EvaluateNextMoveResult | null;
  }
): Promise<string> {
  try {
    const systemPrompt = await getFeedbackDialogueSystemPrompt();

    // Format the original conversation for context - clean and simple
    const conversationText = feedbackContext.originalConversation
      .map(msg => {
        const speaker = msg.role === 'student' ? 'Student' : 'Layperson';
        return `${speaker}: "${msg.content}"`;
      })
      .join('\n');

    const activeItem = executorContext.activeItem;
    const plannerDecision = executorContext.plannerDecision;

    const activeItemSection = activeItem
      ? `ACTIVE FEEDBACK ITEM:
Priority: ${activeItem.priority}
Type: ${activeItem.type}
Concept: ${activeItem.concept}
Target Quote: "${activeItem.target_quote}"
Issue: ${activeItem.issue_description}`
      : `ACTIVE FEEDBACK ITEM:
No active queue item remains.`;

    const plannerSection = plannerDecision
      ? `PLANNER DECISION:
is_resolved: ${plannerDecision.is_resolved}
user_pushback_detected: ${plannerDecision.user_pushback_detected}
next_strategy: ${plannerDecision.next_strategy}
strategy_notes: ${plannerDecision.strategy_notes}`
      : `PLANNER DECISION:
No planner decision provided yet. Start with a focused question on the active item.`;

    // Add executor context to the system prompt
    const enrichedSystemPrompt = `${systemPrompt}

EXECUTOR RULES (HIGHEST PRIORITY):
- You are a Socratic teacher.
- You MUST ask exactly ONE question per response.
- You MUST integrate the provided target quote into your message when an active item exists.
- Do NOT list multiple issues in one reply.
- Follow planner strategy and notes.
- If user pushback is detected: acknowledge perspective, evaluate logic, and redirect to evidence when needed.
- If no active item remains: ask one reflective wrap-up question about transfer to next practice.

${activeItemSection}

${plannerSection}

ORIGINAL CONVERSATION TRANSCRIPT:
${conversationText}

You have the full conversation above. Keep the response concise and evidence-based.`;

    const openaiMessages = [
      { role: "system" as const, content: enrichedSystemPrompt },
      ...feedbackMessages.map(msg => ({
        role: msg.role === "student" ? "user" as const : "assistant" as const,
        content: msg.content
      }))
    ];

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: openaiMessages,
      max_tokens: 200,
      temperature: 0.7,
    });

    return response.choices[0].message.content || "That's an interesting reflection. What else do you think about your explanation?";
  } catch (error) {
    console.error("Teacher response error:", error);
    throw new Error("Failed to generate teacher response");
  }
}

export async function generateFeedback(messages: Message[]): Promise<{
  feedback_queue: FeedbackQueueItem[];
  strengths: string;
  improvements: string;
}> {
  try {
    // Check if the conversation is meaningful (has student responses)
    const studentMessages = messages.filter(msg => msg.role === "student");
    
    // If no student messages or conversation is too short, return empty conversation message
    if (studentMessages.length === 0) {
      const feedbackQueue: FeedbackQueueItem[] = [
        {
          priority: 1,
          type: "improvement",
          concept: "Insufficient student content",
          target_quote: "",
          issue_description: "No student turns were found, so the rubric analyzer cannot assess communication behavior yet",
        },
      ];
      const legacy = buildLegacyFeedbackStrings(feedbackQueue);
      return {
        feedback_queue: feedbackQueue,
        strengths: legacy.strengths,
        improvements: legacy.improvements,
      };
    }
    
    const feedbackPrompt = await storage.getAiPrompt("feedback_analysis");
    const systemPrompt = feedbackPrompt?.prompt || `You are an offline science-communication rubric analyzer.

Task:
- Analyze the transcript and output prioritized actionable items only.
- Ground each item in one exact quote from the student transcript.
- Prioritize by impact (1 = highest).
- Use type = "improvement" for weaknesses and type = "strength" for effective communication behavior.

Output rules:
- Return strict JSON only.
- Use this exact schema:
{
  "feedback_queue": [
    {
      "priority": 1,
      "type": "improvement",
      "concept": "Jargon Usage",
      "target_quote": "Exact quote from student transcript",
      "issue_description": "Used complex term without defining it."
    }
  ]
}
- Do not include markdown, prose outside JSON, or additional keys.
- Include 3 to 6 items when enough evidence exists.`;

    const conversationText = messages.map(msg => 
      `${msg.role === "student" ? "Student" : "Layperson"}: ${msg.content}`
    ).join("\n\n");

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Please analyze this conversation and provide feedback:\n\n${conversationText}` }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    const feedbackQueue: FeedbackQueueItem[] = Array.isArray(result.feedback_queue)
      ? (result.feedback_queue as FeedbackQueueItem[])
      : [];

    const fallbackQueue: FeedbackQueueItem[] = feedbackQueue.length > 0
      ? feedbackQueue
      : [
          {
            priority: 1,
            type: "improvement",
            concept: "Clarity",
            target_quote: studentMessages[0]?.content || "",
            issue_description: "Add clearer plain-language framing and examples for a general audience",
          },
        ];

    const legacy = buildLegacyFeedbackStrings(fallbackQueue);

    return {
      feedback_queue: fallbackQueue,
      strengths: legacy.strengths,
      improvements: legacy.improvements,
    };
  } catch (error) {
    console.error("Feedback generation error:", error);
    const feedbackQueue: FeedbackQueueItem[] = [
      {
        priority: 1,
        type: "improvement",
        concept: "Fallback analysis",
        target_quote: "",
        issue_description: "Analysis model failed. Re-run feedback generation to produce actionable transcript-based items",
      },
    ];
    const legacy = buildLegacyFeedbackStrings(feedbackQueue);

    return {
      feedback_queue: feedbackQueue,
      strengths: legacy.strengths,
      improvements: legacy.improvements,
    };
  }
}

export async function evaluateNextMove(
  feedbackMessages: Array<{ role: "student" | "teacher"; content: string }>,
  activeItem: FeedbackQueueItem
): Promise<EvaluateNextMoveResult> {
  try {
    const latestStudentMessage = [...feedbackMessages]
      .reverse()
      .find(msg => msg.role === "student")?.content || "";

    const transcriptTail = feedbackMessages
      .slice(-6)
      .map(msg => `${msg.role === "student" ? "Student" : "Teacher"}: ${msg.content}`)
      .join("\n");

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a diagnostic processor.

Task:
- Evaluate the student's latest response against the active rubric item.
- Decide whether the active issue is resolved.
- Detect whether the user is pushing back or disagreeing.
- Output strict JSON only.

Required output schema:
{
  "is_resolved": boolean,
  "user_pushback_detected": boolean,
  "next_strategy": "Ask clarifying question" | "Challenge assumption" | "Move to next item",
  "strategy_notes": "Clinical instructions for the Executor"
}

Rules:
- If the student adequately addressed the issue, set is_resolved=true.
- If the student disputes feedback without evidence, set user_pushback_detected=true.
- Keep strategy_notes short, concrete, and actionable.`,
        },
        {
          role: "user",
          content: `ACTIVE RUBRIC ITEM:\n${JSON.stringify(activeItem, null, 2)}\n\nLATEST STUDENT MESSAGE:\n${latestStudentMessage}\n\nRECENT FEEDBACK DIALOGUE:\n${transcriptTail}`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    });

    const parsed = JSON.parse(response.choices[0].message.content || "{}");
    const strategy = parsed.next_strategy;
    const validStrategy: NextStrategy =
      strategy === "Move to next item" || strategy === "Challenge assumption"
        ? strategy
        : "Ask clarifying question";

    return {
      is_resolved: Boolean(parsed.is_resolved),
      user_pushback_detected: Boolean(parsed.user_pushback_detected),
      next_strategy: validStrategy,
      strategy_notes: typeof parsed.strategy_notes === "string"
        ? parsed.strategy_notes
        : "Ask one focused follow-up tied to the active queue item.",
    };
  } catch (error) {
    console.error("evaluateNextMove error:", error);
    return {
      is_resolved: false,
      user_pushback_detected: false,
      next_strategy: "Ask clarifying question",
      strategy_notes: "Model evaluation failed; continue probing the same item with one specific follow-up question.",
    };
  }
}

// Initialize feedback prompts
export async function initializeFeedbackPrompts() {
  try {
    await storage.upsertAiPrompt({
      name: "teacher_role",
      prompt: `You are a Socratic science communication teacher.

  Core behavior:
  - Ask exactly ONE question per response.
  - Focus on only ONE active feedback issue at a time.
  - Integrate the provided target quote directly in your message.
  - Keep your tone supportive but rigorous.

  Pushback rule:
  - If the learner pushes back, do not auto-apologize.
  - Acknowledge their perspective briefly.
  - Evaluate whether their logic is supported by transcript evidence.
  - If not supported, redirect them to the quote and ask one probing question.

  Do not provide a long comprehensive overview.
  Do not list multiple issues in one response.`
    });

    await storage.upsertAiPrompt({
      name: "feedback_analysis",
      prompt: `You are an offline science communication analyzer using the Prodigy dimensions only as internal rubric guidance.

Analyze the transcript and produce a prioritized queue of actionable items. Each item must cite one exact student quote.

Rules:
1. Output STRICT JSON only.
2. Use this exact schema and key names:
{
  "feedback_queue": [
    {
      "priority": 1,
      "type": "improvement",
      "concept": "Jargon Usage",
      "target_quote": "Exact quote from student transcript",
      "issue_description": "Used complex term without defining it."
    }
  ]
}
3. priority must be integers starting at 1, sorted by impact.
4. type must be either "improvement" or "strength".
5. Keep concept concise (2-5 words).
6. Keep issue_description concrete and observable (no generic praise).
7. Produce 3-6 items when transcript evidence is sufficient.
8. Do not include markdown or extra text outside the JSON object.`
    });
  } catch (error) {
    console.error("Failed to initialize feedback prompts:", error);
  }
}
