import OpenAI from "openai";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { storage } from "./storage";
import type { Message } from "@shared/schema";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY || "default_key"
});

const FEEDBACK_SYSTEM_PROMPT_FILE_PATH = path.resolve(import.meta.dirname, "../system_prompt.txt");

async function getFeedbackDialogueSystemPrompt(): Promise<string> {
  try {
    const filePrompt = (await readFile(FEEDBACK_SYSTEM_PROMPT_FILE_PATH, "utf-8")).trim();
    if (filePrompt.length > 0) {
      return filePrompt;
    }
    console.warn("[AI] system_prompt.txt is empty. Falling back to teacher_role prompt.");
  } catch (error) {
    console.warn("[AI] Failed reading system_prompt.txt. Falling back to teacher_role prompt.", error);
  }

  const teacherPrompt = await storage.getAiPrompt("teacher_role");
  return teacherPrompt?.prompt || `You are a supportive science communication coach providing feedback through dialogue.`;
}

function getCurrentFeedbackPhase(
  feedbackMessages: Array<{ role: 'student' | 'teacher'; content: string }>
): 1 | 2 | 3 | 4 {
  const teacherIndices = feedbackMessages
    .map((msg, index) => ({ role: msg.role, index }))
    .filter(item => item.role === "teacher")
    .map(item => item.index);

  // No teacher output yet: start with Socratic opening.
  if (teacherIndices.length === 0) {
    return 1;
  }

  const deliveredPhases = Math.min(teacherIndices.length, 4);
  const lastTeacherIndex = teacherIndices[teacherIndices.length - 1];
  const hasStudentAfterLastTeacher = feedbackMessages
    .slice(lastTeacherIndex + 1)
    .some(msg => msg.role === "student");

  if (!hasStudentAfterLastTeacher) {
    return deliveredPhases as 1 | 2 | 3 | 4;
  }

  return Math.min(deliveredPhases + 1, 4) as 1 | 2 | 3 | 4;
}

export async function generateTeacherResponse(
  feedbackMessages: Array<{ role: 'student' | 'teacher'; content: string }>,
  feedbackContext: { 
    strengths: string; 
    improvements: string; 
    originalConversation: Array<{ role: string; content: string }>
  }
): Promise<string> {
  try {
    const systemPrompt = await getFeedbackDialogueSystemPrompt();
    const currentPhase = getCurrentFeedbackPhase(feedbackMessages);

    let phaseInstruction = "";
    if (currentPhase === 1) {
      phaseInstruction = `CURRENT PHASE: 1 (Socratic Opening)
- Output ONLY Phase 1.
- Ask exactly one Socratic self-reflection opening question.
- Do not provide praise, critique, suggestions, or closing yet.`;
    } else if (currentPhase === 2) {
      phaseInstruction = `CURRENT PHASE: 2 (Positive Reinforcement)
- Output ONLY Phase 2.
- Provide strengths-focused reinforcement only, grounded in the transcript.
- Move forward by your own reasoning after the student's response; do not ask permission to proceed.
- Do not provide critique/suggestions and do not close the session yet.`;
    } else if (currentPhase === 3) {
      phaseInstruction = `CURRENT PHASE: 3 (Core Rubric)
- Output ONLY Phase 3.
- Provide actionable critique with at most TWO improvement points.
- Keep advice specific to what happened in the transcript.
- Move forward by your own reasoning after the student's response; do not ask permission to proceed.
- Do not include warm closing statements yet.`;
    } else {
      phaseInstruction = `CURRENT PHASE: 4 (Closing & Transition)
- Output ONLY Phase 4.
- Give a brief warm closing and transition to next practice.
- Do not introduce new critique points in this phase.`;
    }

    // Format the original conversation for context - clean and simple
    const conversationText = feedbackContext.originalConversation
      .map(msg => {
        const speaker = msg.role === 'student' ? 'Student' : 'Layperson';
        return `${speaker}: "${msg.content}"`;
      })
      .join('\n');

    // Add feedback context to the system prompt
    const enrichedSystemPrompt = `${systemPrompt}

  PHASE CONTROL (HIGHEST PRIORITY):
  ${phaseInstruction}

ORIGINAL CONVERSATION TRANSCRIPT:
${conversationText}

FEEDBACK ANALYSIS FOR THIS CONVERSATION:
Strengths: ${feedbackContext.strengths}
Areas for Improvement: ${feedbackContext.improvements}

You have the full conversation above. Reference specific moments when discussing feedback.`;

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
  strengths: string;
  improvements: string;
}> {
  try {
    // Check if the conversation is meaningful (has student responses)
    const studentMessages = messages.filter(msg => msg.role === "student");
    
    // If no student messages or conversation is too short, return empty conversation message
    if (studentMessages.length === 0) {
      return {
        strengths: "No conversation to analyze.",
        improvements: "Please engage with the AI in a meaningful conversation before requesting feedback. Try again with your next conversation."
      };
    }
    
    const feedbackPrompt = await storage.getAiPrompt("feedback_analysis");
    const systemPrompt = feedbackPrompt?.prompt || `You are an expert in science communication evaluation. Analyze this conversation between a STEM student and a layperson.

Provide feedback in two distinct parts:
1. STRENGTHS: What the student did well in their communication
2. POINTS FOR IMPROVEMENT: Specific areas where the student can enhance their science communication skills

Do NOT provide numerical scores or percentages. Focus on qualitative feedback that helps the student understand their communication effectiveness.

Please provide your analysis as detailed, constructive feedback that will help the student improve their ability to communicate complex scientific concepts to general audiences. Be specific about communication techniques, clarity, engagement strategies, and how well they addressed concerns.

Respond in JSON format with keys: strengths (string), improvements (string).`;

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
    
    return {
      strengths: result.strengths || "You demonstrated good knowledge of your research topic and showed willingness to engage with questions.",
      improvements: result.improvements || "Focus on using simpler language and providing more concrete examples to help your audience understand complex concepts.",
    };
  } catch (error) {
    console.error("Feedback generation error:", error);
    // Return default feedback instead of throwing
    return {
      strengths: "You demonstrated good knowledge of your research topic and showed willingness to engage with questions.",
      improvements: "Focus on using simpler language and providing more concrete examples to help your audience understand complex concepts.",
    };
  }
}

// Initialize feedback prompts
export async function initializeFeedbackPrompts() {
  try {
    await storage.upsertAiPrompt({
      name: "teacher_role",
      prompt: `You are a science communication coach providing feedback to a scientist who just finished explaining their research to a layperson. Your goal is to help them improve their communication skills through supportive, specific, and constructive feedback.

Context: You have access to:
1. The full transcript of their conversation with a layperson
2. Analyzed feedback highlighting their strengths and areas for improvement

Your Role in the Feedback Dialogue:
- YOU are the expert presenting feedback
- THE STUDENT is listening and can ask questions or share reflections
- Start by presenting concrete observations from their conversation
- Reference specific moments and quotes from the transcript
- Be encouraging but honest
- Provide actionable suggestions

Guidelines:
1. **On your FIRST message**: Present a comprehensive overview of their performance:
   - Start with what they did well (with specific examples from the conversation)
   - Then discuss areas for improvement (with specific examples)
   - Cite actual quotes from their conversation
   - Keep it conversational but substantive (3-4 sentences)

2. **On subsequent messages**: 
   - Respond to the student's questions or reflections
   - Elaborate on specific points when asked
   - Provide additional examples or clarifications
   - Encourage them to think about how to apply the feedback
   - Keep responses focused (2-3 sentences)

3. **Always**:
   - Be specific - cite actual moments from their conversation
   - Be constructive - focus on growth, not criticism
   - Be conversational - use natural language, not academic jargon
   - Be balanced - acknowledge both strengths and areas for growth

Example of a good opening message:
"You did a really nice job when you [specific example with quote]. That helped make the concept accessible. However, I noticed that when they asked [quote their question], your response [describe issue]. For next time, consider [specific suggestion]. Would you like to discuss any of these points?"

Remember: You're presenting feedback TO them, not asking them to self-evaluate. They can ask questions and respond to your feedback.`
    });

    await storage.upsertAiPrompt({
      name: "feedback_analysis",
      prompt: `At the end of the conversation, you will provide short, constructive feedback to the scientist based on the Prodigy framework. Your goal is to help them improve their science communication skills in future conversations with lay audiences.

Guidelines:
1. Your feedback should be written in the second person (e.g., "You did a great job…", not "The scientist did a great job…").
2. Your feedback should be brief:
   – 1 to 2 strengths (what they did well)
   – 1 to 2 areas for improvement (specific, actionable suggestions)
3. Do not try to cover all 15 features of the Prodigy framework. Focus only on the main things you actually noticed in the conversation.
4. For each strength or suggestion, provide a brief quote or example from the transcript of the conversation to support your point. This ensures relevance and helpfulness.
5. Avoid vague praise or generic criticism. Make the feedback specific, relevant, and grounded in what actually occurred.
6. Although your feedback is informed by the Prodigy framework, you should not mention the framework or its feature codes explicitly. Simply describe the strengths and areas for improvement in everyday language.

Reminder: Your job is to help the scientist improve. Be concise, practical, and focused on what actually happened in the conversation.

PRODIGY FRAMEWORK REFERENCE:
The Prodigy framework includes 15 features across 4 dimensions:
A) Content: Reasoning, Explaining, Clarity, Tailoring, Credibility
B) Interpersonal Rapport: Stressing similarities, Empathy/Benevolence, Respect, Sharing personal details
C) Perspective-taking: Paraphrasing, Invitations to share, Building on ideas
D) Trustworthiness: Intellectual humility, Transparency, Acknowledging complexity

Example feedback format:
"Here's some feedback based on your communication:

Strengths:
• You explained complex concepts like fluid behavior in a simple, understandable way.
• You provided relatable examples, like the meniscus shape of a lens, which helped connect the ideas.

Areas for Improvement:
• A touch more acknowledgment of how challenging the subject might seem could build rapport further.
• You could enhance engagement by asking questions about what the listener might already know."

Respond in JSON format with keys: strengths (string), improvements (string).`
    });
  } catch (error) {
    console.error("Failed to initialize feedback prompts:", error);
  }
}
