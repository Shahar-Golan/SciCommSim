import OpenAI from "openai";
import fs from "node:fs";
import path from "node:path";
import { storage } from "./storage";
import type { Message } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY || "default_key",
});

export type FeedbackGroup = "A" | "B" | "C";

export function parseFeedbackGroup(input: unknown): FeedbackGroup {
  return input === "A" || input === "B" || input === "C" ? input : "C";
}

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
- Quotes must be copied verbatim from the student's words (do not invent or paraphrase quotes).
- Do not quote the layperson/interviewer.
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

function normalizeForSearch(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function extractInlineQuotes(text: string): string[] {
  const quotes: string[] = [];
  const regex = /"([^"]{3,})"/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    quotes.push(match[1]);
  }
  return quotes;
}

function extractStudentQuoteSnippets(messages: Message[], limit = 10): string[] {
  const snippets: string[] = [];

  for (const msg of messages) {
    if (msg.role !== "student") {
      continue;
    }

    const parts = msg.content
      .replace(/\s+/g, " ")
      .split(/[.!?\n]+/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 24 && part.length <= 160);

    for (const part of parts) {
      snippets.push(part);
      if (snippets.length >= limit) {
        return snippets;
      }
    }
  }

  return snippets;
}

function buildGroupBUserContent(conversationText: string, quoteSnippets: string[]): string {
  if (quoteSnippets.length === 0) {
    return `TRANSCRIPT:\n${conversationText}`;
  }

  const quoteBlock = quoteSnippets.map((snippet, index) => `${index + 1}) ${snippet}`).join("\n");

  return `ALLOWED STUDENT QUOTE SNIPPETS (copy one verbatim into each point and wrap it in double quotes; do not invent quotes):\n${quoteBlock}\n\nTRANSCRIPT:\n${conversationText}`;
}

function groupBQuotesLookValid(points: string[], studentOnlyText: string): boolean {
  const studentNormalized = normalizeForSearch(studentOnlyText);

  return points.every((point) => {
    const quotes = extractInlineQuotes(point);
    if (quotes.length === 0) {
      return false;
    }
    return quotes.every((quote) => studentNormalized.includes(normalizeForSearch(quote)));
  });
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

    const groupBQuoteSnippets = feedbackGroup === "B" ? extractStudentQuoteSnippets(messages, 12) : [];
    const userContent = feedbackGroup === "B" ? buildGroupBUserContent(conversationText, groupBQuoteSnippets) : conversationText;

    const requestOnce = async (temperature: number, extraUserHint?: string) => {
      const content = extraUserHint ? `${extraUserHint}\n\n${userContent}` : userContent;
      return openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content,
          },
        ],
        response_format: { type: "json_object" },
        temperature,
      });
    };

    const response = await requestOnce(feedbackGroup === "B" ? 0.1 : 0.3);

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
      const studentOnlyText = messages
        .filter((msg) => msg.role === "student")
        .map((msg) => msg.content)
        .join("\n\n");

      const combined = [...preservePoints, ...improvementPoints];
      if (!groupBQuotesLookValid(combined, studentOnlyText)) {
        const retry = await requestOnce(
          0,
          "IMPORTANT: Every point must include exactly one direct STUDENT quote in double quotes copied verbatim from the transcript (do not quote the layperson, and do not invent quotes)."
        );
        const retryParsed = JSON.parse(retry.choices[0].message.content || "{}") as Partial<FeedbackAnalysisResult>;
        preservePoints = normalizePoints(
          retryParsed.preserve_points,
          2,
          "Preserve: continue using audience-aware communication behavior"
        );
        improvementPoints = normalizePoints(
          retryParsed.improvement_points,
          3,
          "Improve: simplify and clarify your message for a lay audience"
        );
      }
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
