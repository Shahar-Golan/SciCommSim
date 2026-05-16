import type OpenAI from "openai";
import fs from "node:fs";
import path from "node:path";
import type { Message } from "@shared/schema";

export const DEFAULT_FEEDBACK_AGENT1_SYSTEM_PROMPT = `You are Agent-1.

At the end of the conversation, provide structured feedback on my dialogic abilities based on the Prodigy framework (dimensions and features described below).
The feedback must include:
1. Areas for Improvement (3 points): Specific, actionable ways to improve my communication.
2. Strengths (2 points): Two key communication skills I demonstrated effectively.

Process for generating feedback:
1. Review the full conversation transcript.
2. Identify evidence in my utterances:
   - Instances where I successfully demonstrated Prodigy features.
   - Instances where I did not demonstrate them (including missed opportunities).
3. Generate a candidate list of strengths and improvement points.
4. Select the most important points:
   - Prioritize based on impact on dialogue quality and frequency.
   - Ensure coverage is not limited to a single Prodigy dimension (when possible).
5. Formulate final feedback:
   - Maximum: 3 improvement points + 2 strengths.
   - First present the improvement points, and only afterwards the strengths.
   - Each point must be grounded in Prodigy features and supported by evidence from the transcript.

Evidence / quoting rules:
- NEVER quote the Layperson.
- If an ALLOWED_STUDENT_QUOTE_SNIPPETS list is provided, you MUST ONLY use evidence quotes copied verbatim from that list.
- If no allowed quote list is provided, include evidence as a short evidence summary (no direct quotes).

Output format:
Return STRICT JSON ONLY with this schema:
{
  "areas_for_improvement": [
    {
      "point": "...",
      "actionable_suggestion": "...",
      "prodigy_dimension": "Content | Interpersonal rapport | Perspective-taking and listening | Trustworthiness",
      "prodigy_feature": "...",
      "evidence": "..."
    }
  ],
  "strengths": [
    {
      "point": "...",
      "prodigy_dimension": "Content | Interpersonal rapport | Perspective-taking and listening | Trustworthiness",
      "prodigy_feature": "...",
      "evidence": "..."
    }
  ],
  "notes_for_agent2": "Short notes to help Agent-2 format for Group A vs Group B/C."
}

Constraints:
- areas_for_improvement length: exactly 3.
- strengths: exactly 2 objects.
- evidence: for each point, include transcript-grounded evidence per the rules above.`;

export function loadWorkspaceTextFile(fileName: string): string {
  const candidates = [
    path.resolve(process.cwd(), fileName),
    path.resolve(process.cwd(), "attached_assets", fileName),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return fs.readFileSync(candidate, "utf8").trim();
    }
  }

  throw new Error(`Text file not found: ${fileName}. Tried: ${candidates.join(", ")}`);
}

export function formatTranscriptForFeedback(messages: Message[]): string {
  return messages
    .map((msg) => `${msg.role === "student" ? "Student" : "Layperson"}: ${msg.content}`)
    .join("\n\n");
}

function formatQuoteSnippets(snippets: string[]): string {
  return snippets.map((snippet, index) => `${index + 1}) ${snippet}`).join("\n");
}

export async function runFeedbackAgent1GlobalAnalysis(
  openai: OpenAI,
  params: {
    transcriptText: string;
    prodigyFrameworkText: string;
    allowedStudentQuoteSnippets?: string[];
    systemPromptOverride?: string;
  },
): Promise<string> {
  const { transcriptText, prodigyFrameworkText, allowedStudentQuoteSnippets, systemPromptOverride } = params;

  const hasQuoteSnippets = Array.isArray(allowedStudentQuoteSnippets) && allowedStudentQuoteSnippets.length > 0;

  const systemPrompt = (systemPromptOverride && systemPromptOverride.trim().length > 0)
    ? systemPromptOverride.trim()
    : DEFAULT_FEEDBACK_AGENT1_SYSTEM_PROMPT;

  const userContentParts = [
    `PRODIGY_FRAMEWORK:\n${prodigyFrameworkText}`,
    hasQuoteSnippets
      ? `\n\nALLOWED_STUDENT_QUOTE_SNIPPETS (copy verbatim; do not invent quotes):\n${formatQuoteSnippets(
          allowedStudentQuoteSnippets!,
        )}`
      : "",
    `\n\nTRANSCRIPT:\n${transcriptText}`,
  ].filter(Boolean);

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContentParts.join("") },
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
  });

  return response.choices[0]?.message?.content || "{}";
}
