import OpenAI from "openai";
import { storage } from "./storage";
import type { Message } from "@shared/schema";
import { loadWorkspaceTextFile, formatTranscriptForFeedback, runFeedbackAgent1GlobalAnalysis, DEFAULT_FEEDBACK_AGENT1_SYSTEM_PROMPT } from "./feedback-agents";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY || "default_key",
});

const FEEDBACK_THINKING_MODEL =
  process.env.OPENAI_FEEDBACK_THINKING_MODEL || process.env.OPENAI_FEEDBACK_MODEL || "gpt-5";

const FEEDBACK_THINKING_MODEL_FALLBACK = process.env.OPENAI_FEEDBACK_THINKING_MODEL_FALLBACK || "gpt-4o";

function isModelNotFoundError(error: unknown): boolean {
  return !!error && typeof error === "object" && (error as any).code === "model_not_found";
}

function isTemperatureUnsupportedError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    (error as any).code === "unsupported_value" &&
    (error as any).param === "temperature"
  );
}

export type FeedbackGroup = "A" | "B" | "C";

export function parseFeedbackGroup(input: unknown): FeedbackGroup {
  return input === "A" || input === "B" || input === "C" ? input : "C";
}

type FeedbackAnalysisResult = {
  preserve_points: string[];
  improvement_points: string[];
};

// NOTE: We still load Feedback_Prompt.txt for backwards-compatibility and potential future use,
// but the current Group A/B/C prompts are replaced with the experiment prompts from missions.md.
loadWorkspaceTextFile("Feedback_Prompt.txt");
const PRODIGY_FRAMEWORK_TEXT = loadWorkspaceTextFile("prodigy_framework.txt");

const FEEDBACK_AGENT1_PROMPT_NAME = "feedback_agent1_global";

const FEEDBACK_ANALYSIS_PROMPT_CONFIG: Record<FeedbackGroup, { name: string; prompt: string }> = {
  A: {
    name: "feedback_analysis_group_a",
    prompt: `GROUP A:
THE NEXT BULLET, IN GREEN FONT, IS ONLY FOR GROUP ‘A’ (CONTROL GROUP – ‘ZERO EXPLAINABILITY’) IN THE EXPERIMENT:
Structure of Feedback Points:
When presenting the feedback, do NOT include quotes, references, or paraphrases from the conversation transcript. Provide only the feedback points themselves, in a concise form.
Output format:
•	Areas for Improvement (up to 3 points): Short, actionable recommendations. 
•	Strength (1 point): One concise statement describing what was done well. 
Guidelines:
•	Each point should be brief (1–2 sentences maximum). 
•	Focus on clear, actionable advice, without justification or detailed explanation. 
•	Do not include evidence, examples from the conversation, or suggested phrasing. 
•	Avoid repetition – each point should address a distinct aspect of dialogic communication. 
•	Maintain a neutral, professional tone (avoid praise-heavy or evaluative language). 
•	Base all feedback implicitly on Prodigy features, but do not explicitly elaborate on them. 
Here is an example of what such feedback might look like:
Areas for improvement:
1.	Reduce the use of jargon and use simpler, more accessible language. 
2.	Invite your conversation partner to share their thoughts more actively. 
3.	Show more empathy when responding to concerns raised by the conversation partner. 
Strength: You clearly explained the importance and real-world relevance of your research.

IMPORTANT: Return strict JSON only with this schema:
{
  "preserve_points": ["..."],
  "improvement_points": ["...", "...", "..."]
}

Constraints:
- "preserve_points" must contain exactly 1 item.
- "improvement_points" must contain 1 to 3 items.
- Do NOT include any transcript quotes or paraphrases.`,
  },
  B: {
    name: "feedback_analysis_group_b",
    prompt: `GROUP B+C:

THE NEXT BULLET, IN RED FONT, IS ONLY FOR GROUPS ‘B’ AND ‘C’ IN THE EXPERIMENT:

Structure of feedback points:
For strengths:
•	Briefly describe what was done well. 
•	Reference a concrete example (quote or paraphrase). 
•	Explain why this aligns with Prodigy. 

For areas for improvement:
Each point should include:
1.	Evidence (quote from the conversation) 
2.	Diagnosis (what was suboptimal or missing, linked to Prodigy) 
3.	Actionable suggestion (what to do instead) 
4.	Optional example phrasing 

Use the following as a flexible guideline (not a rigid template):
•	If something was done suboptimally:
“You said: ‘___’. This may be problematic because ___ (Prodigy-based explanation). A more effective approach would be to _____. For example: ‘’_______.”
Here is an example of this type of feedback:
For instance, if I used too much jargon, you could provide me with the following feedback: “When presenting your research, you said: ‘I explore the use of LLMs for communication training.’ This could be problematic, since a lot of people are not familiar with the term ‘LLMs’, and that could be confusing for them. Instead of ‘LLMs’ you could say something in simpler words that a layperson would understand, like: ‘Artificial Intelligence’ or ‘computer programs’. “
•	If something was missing (missed opportunity):
“When you said: ‘___’, this could have been an opportunity to _______. You could have added something like: ‘’_________.”
Here is an example of this type of feedback:
For instance, if I didn’t ask even a single open question during the entire conversation, you could provide me with the following feedback: “When talking about the data collection, you said: ‘We’re really struggling with getting participants to sign up for the experiment.’ This could be a great opportunity to ask your conversation partner for their ideas, making them more active in the conversation. You could ask your conversation partner something like: ‘Do you have any ideas or suggestions on how to raise participants’ motivation to sign up for the experiment?’ “.

Additional guidelines:
•	Be specific and evidence-based – avoid vague or generic feedback. 
•	Avoid excessive praise or encouragement – focus on constructive, professional feedback. 
•	Do not repeat similar points – each point should address a distinct issue. 
•	Use clear, concise language suitable for learning. 
•	Prioritize actionable insights over exhaustive coverage. 

IMPORTANT: Return strict JSON only with this schema:
{
  "preserve_points": ["..."],
  "improvement_points": ["...", "...", "..."]
}

Constraints:
- "preserve_points" must contain exactly 1 item.
- "improvement_points" must contain 1 to 3 items.
- Do NOT quote the layperson. Quotes (if used) must be copied verbatim from the student's words (do not invent quotes).`,
  },
  C: {
    name: "feedback_analysis_group_c",
    // Group C shares the same prompt guidelines as Group B for the experiment.
    prompt: `GROUP B+C:

THE NEXT BULLET, IN RED FONT, IS ONLY FOR GROUPS ‘B’ AND ‘C’ IN THE EXPERIMENT:

Structure of feedback points:
For strengths:
•	Briefly describe what was done well. 
•	Reference a concrete example (quote or paraphrase). 
•	Explain why this aligns with Prodigy. 

For areas for improvement:
Each point should include:
1.	Evidence (quote from the conversation) 
2.	Diagnosis (what was suboptimal or missing, linked to Prodigy) 
3.	Actionable suggestion (what to do instead) 
4.	Optional example phrasing 

Use the following as a flexible guideline (not a rigid template):
•	If something was done suboptimally:
“You said: ‘___’. This may be problematic because ___ (Prodigy-based explanation). A more effective approach would be to _____. For example: ‘’_______.”
Here is an example of this type of feedback:
For instance, if I used too much jargon, you could provide me with the following feedback: “When presenting your research, you said: ‘I explore the use of LLMs for communication training.’ This could be problematic, since a lot of people are not familiar with the term ‘LLMs’, and that could be confusing for them. Instead of ‘LLMs’ you could say something in simpler words that a layperson would understand, like: ‘Artificial Intelligence’ or ‘computer programs’. “
•	If something was missing (missed opportunity):
“When you said: ‘___’, this could have been an opportunity to _______. You could have added something like: ‘’_________.”
Here is an example of this type of feedback:
For instance, if I didn’t ask even a single open question during the entire conversation, you could provide me with the following feedback: “When talking about the data collection, you said: ‘We’re really struggling with getting participants to sign up for the experiment.’ This could be a great opportunity to ask your conversation partner for their ideas, making them more active in the conversation. You could ask your conversation partner something like: ‘Do you have any ideas or suggestions on how to raise participants’ motivation to sign up for the experiment?’ “.

Additional guidelines:
•	Be specific and evidence-based – avoid vague or generic feedback. 
•	Avoid excessive praise or encouragement – focus on constructive, professional feedback. 
•	Do not repeat similar points – each point should address a distinct issue. 
•	Use clear, concise language suitable for learning. 
•	Prioritize actionable insights over exhaustive coverage. 

IMPORTANT: Return strict JSON only with this schema:
{
  "preserve_points": ["..."],
  "improvement_points": ["...", "...", "..."]
}

Constraints:
- "preserve_points" must contain exactly 1 item.
- "improvement_points" must contain 1 to 3 items.
- Do NOT quote the layperson. Quotes (if used) must be copied verbatim from the student's words (do not invent quotes).`,
  },
};

async function getFeedbackAnalysisPromptByGroup(group: FeedbackGroup): Promise<string> {
  const config = FEEDBACK_ANALYSIS_PROMPT_CONFIG[group] || FEEDBACK_ANALYSIS_PROMPT_CONFIG.C;
  const prompt = await storage.getAiPrompt(config.name);
  return prompt?.prompt || config.prompt;
}

function wrapAgent2SystemPrompt(basePrompt: string, group: FeedbackGroup): string {
  if (group === "A") {
    return `${basePrompt}\n\nIMPORTANT (Agent-2): The user message contains Agent-1 global analysis (not the raw transcript).\n- Do NOT include transcript quotes or transcript references.\n- Generate output strictly according to the schema.`;
  }

  return `${basePrompt}\n\nIMPORTANT (Agent-2): The user message contains Agent-1 global analysis (and may include an allowed-quote list).\n- Use Agent-1 analysis as primary guidance.\n- Do NOT quote the layperson.\n- If you include quotes, they must be exact STUDENT quotes (do not invent quotes).\n- Generate output strictly according to the schema.`;
}

function normalizePoints(points: unknown, requiredCount: number, fallbackPrefix: string): string[] {
  const items = Array.isArray(points) ? points.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean) : [];

  const trimmed = items.slice(0, requiredCount);
  while (trimmed.length < requiredCount) {
    trimmed.push(`${fallbackPrefix} ${trimmed.length + 1}.`);
  }

  return trimmed;
}

function normalizePointsRange(
  points: unknown,
  minCount: number,
  maxCount: number,
  fallback: string,
): string[] {
  const min = Number.isFinite(minCount) ? Math.max(0, Math.floor(minCount)) : 0;
  const max = Number.isFinite(maxCount) ? Math.max(min, Math.floor(maxCount)) : min;

  const items = Array.isArray(points)
    ? points
        .filter((item) => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, max)
    : [];

  while (items.length < min) {
    items.push(min > 1 ? `${fallback} ${items.length + 1}.` : fallback);
  }

  return items;
}

function formatPoints(points: string[]): string {
  return points.map((point) => `- ${point}`).join("\n");
}

function normalizeForSearch(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function extractInlineQuotes(text: string): string[] {
  const quotes: string[] = [];
  const patterns: RegExp[] = [
    /"([^"]{3,})"/g,      // straight double quotes
    /“([^”]{3,})”/g,       // curly double quotes
    /'([^']{6,})'/g,       // straight single quotes (min length to avoid contractions)
    /‘([^’]{6,})’/g,       // curly single quotes
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      quotes.push(match[1]);
    }
  }

  return quotes;
}

function extractStudentQuoteSnippets(messages: Message[], limit = 10): string[] {
  const desired = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0;
  if (desired === 0) {
    return [];
  }

  const keywordRegex = /\b(retina|inherited|disease|blind|vision|gene|genes|genetic|mutation|mutated|allele|diagnos|treatment|counsel|founder)\b/i;
  const smallTalkPenalty = /\b(technion|genius|smart|architecture)\b/i;

  const candidates: Array<{ text: string; score: number; order: number }> = [];
  let order = 0;

  for (const msg of messages) {
    if (msg.role !== "student") {
      continue;
    }

    const parts = msg.content
      .replace(/\s+/g, " ")
      .split(/[.!?\n]+/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 24 && part.length <= 180);

    for (const part of parts) {
      const length = part.length;
      const lengthScore = length >= 60 ? 3 : length >= 40 ? 2 : 1;
      const keywordScore = keywordRegex.test(part) ? 4 : 0;
      const penalty = smallTalkPenalty.test(part) ? 3 : 0;
      const score = lengthScore + keywordScore - penalty;

      candidates.push({ text: part, score, order: order++ });
    }
  }

  // Deduplicate by normalized text, keep the highest-scoring occurrence.
  const byNorm = new Map<string, { text: string; score: number; order: number }>();
  for (const candidate of candidates) {
    const norm = normalizeForSearch(candidate.text);
    const existing = byNorm.get(norm);
    if (!existing || candidate.score > existing.score) {
      byNorm.set(norm, candidate);
    }
  }

  const ranked = Array.from(byNorm.values()).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.order - b.order;
  });

  return ranked.slice(0, desired).map((item) => item.text);
}

function buildGroupBUserContent(conversationText: string, quoteSnippets: string[]): string {
  if (quoteSnippets.length === 0) {
    return `INPUT_CONTEXT:\n${conversationText}`;
  }

  const quoteBlock = quoteSnippets.map((snippet, index) => `${index + 1}) ${snippet}`).join("\n");

  return `ALLOWED STUDENT QUOTE SNIPPETS (copy verbatim; do not invent quotes):\n${quoteBlock}\n\nINPUT_CONTEXT:\n${conversationText}`;
}

function groupBImprovementQuotesLookValid(improvementPoints: string[], studentOnlyText: string): boolean {
  const studentNormalized = normalizeForSearch(studentOnlyText);

  return improvementPoints.every((point) => {
    const quotes = extractInlineQuotes(point);
    if (quotes.length === 0) {
      return false;
    }
    return quotes.every((quote) => studentNormalized.includes(normalizeForSearch(quote)));
  });
}

function groupBPreserveQuotesLookValidOrAbsent(preservePoints: string[], studentOnlyText: string): boolean {
  const studentNormalized = normalizeForSearch(studentOnlyText);

  return preservePoints.every((point) => {
    const quotes = extractInlineQuotes(point);
    if (quotes.length === 0) {
      // Strengths may reference a paraphrase instead of a quote.
      return true;
    }
    return quotes.every((quote) => studentNormalized.includes(normalizeForSearch(quote)));
  });
}

function stripQuotedSegments(text: string): string {
  return text
    .replace(/"[^"]*"/g, " ")
    .replace(/“[^”]*”/g, " ")
    .replace(/'[^']*'/g, " ")
    .replace(/‘[^’]*’/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function groupBPointsHaveExplanations(points: string[]): boolean {
  return points.every((point) => {
    const nonQuoteWords = stripQuotedSegments(point)
      .split(/\s+/)
      .filter(Boolean);
    return nonQuoteWords.length >= 6;
  });
}

function forceGroupBExplanation(point: string, kind: "strength" | "improvement"): string {
  const quote = extractInlineQuotes(point)[0];
  if (!quote) {
    return point;
  }

  if (kind === "strength") {
    return `You used a clear communication move in "${quote}", which helps a layperson understand your message.`;
  }

  return `When you said "${quote}", the wording can confuse a layperson, so simplify and clarify this idea.`;
}

function enforceGroupBExplanations(points: string[], kind: "strength" | "improvement"): string[] {
  return points.map((point) => {
    if (groupBPointsHaveExplanations([point])) {
      return point;
    }
    return forceGroupBExplanation(point, kind);
  });
}

function selectMessagesForFeedback(messages: Message[]): Message[] {
  // Heuristic: ignore early small-talk / status talk and start around the first research-content student turn.
  // This keeps feedback focused on dialogic science-communication moments.
  // NOTE: We intentionally do NOT match generic "PhD" mentions because those often appear in small talk.
  const researchKeyword = /\b(lab|retina|disease|gene|genes|genetic|mutation|mutated|allele|diagnos|treatment|counsel|founder)\b/i;
  const index = messages.findIndex((msg) => msg.role === "student" && researchKeyword.test(msg.content));
  if (index <= 0) {
    return messages;
  }

  // Keep a small lead-in for context.
  const start = Math.max(0, index - 1);
  return messages.slice(start);
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

    const messagesForFeedback = selectMessagesForFeedback(messages);
    const transcriptText = formatTranscriptForFeedback(messagesForFeedback);

    const needsQuotes = feedbackGroup === "B" || feedbackGroup === "C";
    const allowedStudentQuoteSnippets = needsQuotes ? extractStudentQuoteSnippets(messagesForFeedback, 12) : undefined;

    const agent1PromptFromDb = await storage.getAiPrompt(FEEDBACK_AGENT1_PROMPT_NAME);
    const agent1SystemPrompt = agent1PromptFromDb?.prompt || DEFAULT_FEEDBACK_AGENT1_SYSTEM_PROMPT;

    const agent1Output = await runFeedbackAgent1GlobalAnalysis(openai, {
      transcriptText,
      prodigyFrameworkText: PRODIGY_FRAMEWORK_TEXT,
      allowedStudentQuoteSnippets,
      systemPromptOverride: agent1SystemPrompt,
    });

    const baseAgent2Prompt = await getFeedbackAnalysisPromptByGroup(feedbackGroup);
    const systemPrompt = wrapAgent2SystemPrompt(baseAgent2Prompt, feedbackGroup);

    const groupBQuoteSnippets = feedbackGroup === "B" ? extractStudentQuoteSnippets(messagesForFeedback, 12) : [];
    const userContent = feedbackGroup === "B"
      ? buildGroupBUserContent(`AGENT_1_OUTPUT:\n${agent1Output}`, groupBQuoteSnippets)
      : agent1Output;

    const requestOnceWithModel = async (model: string, temperature: number, extraUserHint?: string) => {
      const content = extraUserHint ? `${extraUserHint}\n\n${userContent}` : userContent;
      const messages = [
        { role: "system" as const, content: systemPrompt },
        {
          role: "user" as const,
          content,
        },
      ];

      try {
        const completion = await openai.chat.completions.create({
          model,
          messages,
          response_format: { type: "json_object" },
          temperature,
        });
        return { completion, usedModel: model };
      } catch (error) {
        if (isTemperatureUnsupportedError(error)) {
          console.warn(
            `[AI] Model '${model}' does not support non-default temperature; retrying without temperature.`
          );
          const completion = await openai.chat.completions.create({
            model,
            messages,
            response_format: { type: "json_object" },
          });
          return { completion, usedModel: model };
        }
        throw error;
      }
    };

    const requestOnce = async (temperature: number, extraUserHint?: string) => {
      try {
        return await requestOnceWithModel(FEEDBACK_THINKING_MODEL, temperature, extraUserHint);
      } catch (error) {
        if (
          isModelNotFoundError(error) &&
          FEEDBACK_THINKING_MODEL_FALLBACK &&
          FEEDBACK_THINKING_MODEL_FALLBACK !== FEEDBACK_THINKING_MODEL
        ) {
          console.warn(
            `[AI] Feedback model '${FEEDBACK_THINKING_MODEL}' not available (model_not_found). Falling back to '${FEEDBACK_THINKING_MODEL_FALLBACK}'.`
          );
          return await requestOnceWithModel(FEEDBACK_THINKING_MODEL_FALLBACK, temperature, extraUserHint);
        }
        throw error;
      }
    };

    const { completion: response, usedModel } = await requestOnce(feedbackGroup === "B" ? 0.1 : 0.3);

    console.log(`[AI] Feedback analysis used model '${usedModel}'.`);

    const parsed = JSON.parse(response.choices[0].message.content || "{}") as Partial<FeedbackAnalysisResult>;

    let preservePoints = normalizePointsRange(
      parsed.preserve_points,
      1,
      1,
      "You communicated effectively with a layperson."
    );
    let improvementPoints = normalizePointsRange(
      parsed.improvement_points,
      1,
      3,
      "Simplify jargon and add one concrete example to clarify your point."
    );

    if (feedbackGroup === "B") {
      const studentOnlyText = messages
        .filter((msg) => msg.role === "student")
        .map((msg) => msg.content)
        .join("\n\n");

      const preserveQuotesOk = groupBPreserveQuotesLookValidOrAbsent(preservePoints, studentOnlyText);
      const improvementQuotesOk = groupBImprovementQuotesLookValid(improvementPoints, studentOnlyText);
      const combined = [...preservePoints, ...improvementPoints];
      const hasExplanations = groupBPointsHaveExplanations(combined);

      if (!preserveQuotesOk || !improvementQuotesOk || !hasExplanations) {
        const { completion: retry } = await requestOnce(
          0,
          "IMPORTANT: Do not quote the layperson. Improvement points must include at least one direct STUDENT quote copied verbatim from the transcript (do not invent quotes). Also include diagnosis + actionable suggestion; quote-only bullets are invalid."
        );
        const retryParsed = JSON.parse(retry.choices[0].message.content || "{}") as Partial<FeedbackAnalysisResult>;
        preservePoints = normalizePointsRange(
          retryParsed.preserve_points,
          1,
          1,
          "You communicated effectively with a layperson."
        );
        improvementPoints = normalizePointsRange(
          retryParsed.improvement_points,
          1,
          3,
          "Simplify jargon and add one concrete example to clarify your point."
        );

        const retryPreserveQuotesOk = groupBPreserveQuotesLookValidOrAbsent(preservePoints, studentOnlyText);
        const retryImprovementQuotesOk = groupBImprovementQuotesLookValid(improvementPoints, studentOnlyText);
        const retryHasExplanations = groupBPointsHaveExplanations([...preservePoints, ...improvementPoints]);

        // Final guardrail: if quotes are valid but explanation is too thin, force a minimal explanation.
        if (retryPreserveQuotesOk && retryImprovementQuotesOk && !retryHasExplanations) {
          preservePoints = enforceGroupBExplanations(preservePoints, "strength");
          improvementPoints = enforceGroupBExplanations(improvementPoints, "improvement");
        }
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
    const groupUpserts = (Object.keys(FEEDBACK_ANALYSIS_PROMPT_CONFIG) as FeedbackGroup[]).map((group) => {
      const config = FEEDBACK_ANALYSIS_PROMPT_CONFIG[group];
      return storage.upsertAiPrompt({
        name: config.name,
        prompt: config.prompt,
      });
    });

    await Promise.all([
      ...groupUpserts,
      storage.upsertAiPrompt({
        name: FEEDBACK_AGENT1_PROMPT_NAME,
        prompt: DEFAULT_FEEDBACK_AGENT1_SYSTEM_PROMPT,
      }),
    ]);
  } catch (error) {
    console.error("Failed to initialize feedback prompts:", error);
  }
}
