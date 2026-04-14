import OpenAI from "openai";
import fs from "node:fs";
import path from "node:path";
import { storage } from "./storage";
import type { Message } from "@shared/schema";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY || "default_key",
});

export type FeedbackGroup = "A" | "B" | "C";

type FeedbackAnalysisResult = {
  preserve_points: string[];
  improvement_points: string[];
};

function loadPromptFile(fileName: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), "attached_assets", fileName), "utf8").trim();
}

const PRODIGY_FEEDBACK_GUIDANCE = loadPromptFile("Feedback_Prompt.txt");

const FEEDBACK_ANALYSIS_PROMPT_CONFIG: Record<FeedbackGroup, { name: string; prompt: string }> = {
  A: {
    name: "feedback_analysis_group_a",
    prompt: `${PRODIGY_FEEDBACK_GUIDANCE}

You are a science communication feedback coach.
requirements:
- No references or quotes from transcript.
- Output exactly 2 preserve points and exactly 3 improvement points.
- Focus on Prodigy-based feedback for layperson communication.
Return strict JSON only with this schema:
{
  "preserve_points": ["...", "..."],
  "improvement_points": ["...", "...", "..."]
}`,
  },
  B: {
    name: "feedback_analysis_group_b",
    prompt: `${PRODIGY_FEEDBACK_GUIDANCE}

You are a science communication feedback coach.
Generate feedback for Group B.
Group B requirements:
- You must include references or quotes from what the student said that made you provide a certain feedback.
- Every preserve and improvement point must include one direct student quote in double quotes.
- Output exactly 2 short preserve points and exactly 3 short improvement points.
- Each point must be one concise sentence.
- Focus on communication to a layperson (clarity, wording, audience engagement).
Return strict JSON only with this schema:
{
  "preserve_points": ["...", "..."],
  "improvement_points": ["...", "...", "..."]
}`,
  },
  C: {
    name: "feedback_analysis_group_c",
    prompt: `You are a science communication feedback coach.
Generate feedback for Group C.
Group C requirements:
- Include references to what the student said in each point.
- Keep points suitable for later dialogic coaching.
- Output exactly 2 short preserve points and exactly 3 short improvement points.
- Each point must be one concise sentence.
- Focus on communication to a layperson (clarity, wording, pacing, audience engagement).
Return strict JSON only with this schema:
{
  "preserve_points": ["...", "..."],
  "improvement_points": ["...", "...", "..."]
}`,
  },
};

async function getFeedbackAnalysisPromptByGroup(group: FeedbackGroup): Promise<string> {
  const config = FEEDBACK_ANALYSIS_PROMPT_CONFIG[group] || FEEDBACK_ANALYSIS_PROMPT_CONFIG.C;
  const prompt = await storage.getAiPrompt(config.name);
  return prompt?.prompt || config.prompt;
}

function normalizePoints(points: unknown, requiredCount: number, fallbackPrefix: string): string[] {
  const items = Array.isArray(points) ? points.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean) : [];

  const trimmed = items.slice(0, requiredCount);
  while (trimmed.length < requiredCount) {
    trimmed.push(`${fallbackPrefix} ${trimmed.length + 1}.`);
  }

  return trimmed;
}

function formatPoints(points: string[]): string {
  return points.map((point) => `- ${point}`).join("\n");
}

function hasInlineQuote(text: string): boolean {
  return /"[^"]{3,}"/.test(text);
}

function extractStudentQuoteSnippets(messages: Message[], limit = 8): string[] {
  const snippets: string[] = [];

  for (const msg of messages) {
    if (msg.role !== "student") {
      continue;
    }

    const parts = msg.content
      .split(/[.!?\n]+/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 24 && part.length <= 160);

    for (const part of parts) {
      snippets.push(part.replace(/"/g, "'"));
      if (snippets.length >= limit) {
        return snippets;
      }
    }
  }

  return snippets;
}

function enforceGroupBQuotes(points: string[], quoteSnippets: string[]): string[] {
  if (quoteSnippets.length === 0) {
    return points;
  }

  let quoteIndex = 0;
  return points.map((point) => {
    if (hasInlineQuote(point)) {
      return point;
    }

    const quote = quoteSnippets[quoteIndex % quoteSnippets.length];
    quoteIndex += 1;
    return `${point} Quote: "${quote}".`;
  });
}

async function getFeedbackDialogueSystemPrompt(): Promise<string> {
  const teacherPrompt = await storage.getAiPrompt("teacher_role");
  return teacherPrompt?.prompt || "You are a supportive science communication coach providing concise written feedback dialogue.";
}

export async function generateTeacherResponse(
  feedbackMessages: Array<{ role: "student" | "teacher"; content: string }>,
  feedbackContext: {
    originalConversation: Array<{ role: string; content: string }>;
  }
): Promise<string> {
  try {
    const systemPrompt = await getFeedbackDialogueSystemPrompt();

    const conversationText = feedbackContext.originalConversation
      .map((msg) => {
        const speaker = msg.role === "student" ? "Student" : "Layperson";
        return `${speaker}: "${msg.content}"`;
      })
      .join("\n");

    const enrichedSystemPrompt = `${systemPrompt}

RULES:
- Keep responses concise and practical.
- Focus on communication behavior for a lay audience.
- Ask at most one question in a response.
- Do not ask the student to explain science content deeply.

ORIGINAL CONVERSATION TRANSCRIPT:
${conversationText}`;

    const openaiMessages = [
      { role: "system" as const, content: enrichedSystemPrompt },
      ...feedbackMessages.map((msg) => ({
        role: msg.role === "student" ? ("user" as const) : ("assistant" as const),
        content: msg.content,
      })),
    ];

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: openaiMessages,
      max_tokens: 200,
      temperature: 0.6,
    });

    return response.choices[0].message.content || "Thanks for sharing. What is one communication change you want to try next?";
  } catch (error) {
    console.error("Teacher response error:", error);
    throw new Error("Failed to generate teacher response");
  }
}

export async function generateFeedback(
  messages: Message[],
  feedbackGroup: FeedbackGroup = "C"
): Promise<{
  strengths: string;
  improvements: string;
}> {
  try {
    const studentMessages = messages.filter((msg) => msg.role === "student");

    if (studentMessages.length === 0) {
      return {
        strengths: "- You completed the activity and reached the feedback stage.\n- You can build on this by adding clear audience-centered phrasing.",
        improvements:
          "- Add more complete spoken responses so communication can be assessed.\n- Use simple language suitable for a non-expert audience.\n- Ask at least one open question to involve the listener.",
      };
    }

    const systemPrompt = await getFeedbackAnalysisPromptByGroup(feedbackGroup);
    const conversationText = messages
      .map((msg) => `${msg.role === "student" ? "Student" : "Layperson"}: ${msg.content}`)
      .join("\n\n");

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Analyze this conversation and return exactly 2 preserve points and exactly 3 improvement points:\n\n${conversationText}`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const parsed = JSON.parse(response.choices[0].message.content || "{}") as Partial<FeedbackAnalysisResult>;

    let preservePoints = normalizePoints(
      parsed.preserve_points,
      2,
      "Preserve: continue using audience-aware communication behavior"
    );
    let improvementPoints = normalizePoints(
      parsed.improvement_points,
      3,
      "Improve: simplify and clarify your message for a lay audience"
    );

    if (feedbackGroup === "B") {
      const quoteSnippets = extractStudentQuoteSnippets(messages);
      preservePoints = enforceGroupBQuotes(preservePoints, quoteSnippets);
      improvementPoints = enforceGroupBQuotes(improvementPoints, quoteSnippets);
    }

    return {
      strengths: formatPoints(preservePoints),
      improvements: formatPoints(improvementPoints),
    };
  } catch (error) {
    console.error("Feedback generation error:", error);
    return {
      strengths:
        "- You attempted to explain your ideas to a non-expert listener.\n- You stayed engaged through the conversation.",
      improvements:
        "- Use shorter and simpler phrasing for technical ideas.\n- Add one concrete example when explaining a concept.\n- Ask one open question to check listener understanding.",
    };
  }
}

// Initialize feedback prompts
export async function initializeFeedbackPrompts() {
  try {
    await Promise.all(
      (Object.keys(FEEDBACK_ANALYSIS_PROMPT_CONFIG) as FeedbackGroup[]).map((group) => {
        const config = FEEDBACK_ANALYSIS_PROMPT_CONFIG[group];
        return storage.upsertAiPrompt({
          name: config.name,
          prompt: config.prompt,
        });
      }),
    );
  } catch (error) {
    console.error("Failed to initialize feedback prompts:", error);
  }
}
