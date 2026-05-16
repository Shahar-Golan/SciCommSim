import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type TranscriptMessage = {
  role: "student" | "ai";
  content: string;
  timestamp: string;
};

type FeedbackGroup = "A" | "B" | "C";

type ApiError = { message?: string };

function nowIso() {
  return new Date().toISOString();
}

function safeFileTimestamp(d = new Date()) {
  // YYYYMMDD-HHMMSS
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

async function parseConvTranscript(filePath: string): Promise<TranscriptMessage[]> {
  const raw = await readFile(filePath, "utf8");
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const messages: TranscriptMessage[] = [];
  for (const line of lines) {
    const match = line.match(/^(Ayelet|student)\s*:\s*(.+)$/i);
    if (!match) continue;

    const speaker = match[1].toLowerCase();
    const content = match[2].trim();
    if (!content) continue;

    messages.push({
      role: speaker === "student" ? "student" : "ai",
      content,
      timestamp: nowIso(),
    });
  }

  if (messages.length === 0) {
    throw new Error(
      `No transcript lines matched 'Ayelet:' or 'student:' in ${path.basename(filePath)}.`,
    );
  }

  return messages;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();

  if (!res.ok) {
    let parsed: ApiError | undefined;
    try {
      parsed = JSON.parse(text) as ApiError;
    } catch {
      // ignore
    }
    const message = parsed?.message || text || res.statusText;
    throw new Error(`${res.status} ${res.statusText}: ${message}`);
  }

  return (text ? (JSON.parse(text) as T) : ({} as T));
}

async function main() {
  const baseUrl = (process.env.BASE_URL || "http://localhost:5000").replace(/\/+$/, "");

  const repoRoot = process.cwd();
  const transcriptArg = process.argv[2];
  const transcriptPath = transcriptArg
    ? path.isAbsolute(transcriptArg)
      ? transcriptArg
      : path.resolve(repoRoot, transcriptArg)
    : path.resolve(repoRoot, "conv1.txt");

  const outputDir = path.resolve(repoRoot, "test");
  const runStamp = safeFileTimestamp();

  const transcript = await parseConvTranscript(transcriptPath);

  const transcriptFileName = path.basename(transcriptPath).toLowerCase();
  const conversationNumber = transcriptFileName.includes("conv2") ? 2 : 1;

  const groups: FeedbackGroup[] = ["A", "B", "C"];
  const outputs: Array<{ group: FeedbackGroup; feedback: unknown; outputFile: string; conversationId: string }> = [];

  for (const group of groups) {
    // Create a fresh conversation per group to avoid overwriting the same feedback row.
    const student = await fetchJson<{ id: string }>(`${baseUrl}/api/students`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `Sanity Test ${runStamp} (Group ${group})`,
        consent: "Y",
      }),
    });

    const session = await fetchJson<{ id: string }>(`${baseUrl}/api/training-sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId: student.id,
      }),
    });

    const conversation = await fetchJson<{ id: string }>(`${baseUrl}/api/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: session.id,
        conversationNumber,
        transcript,
      }),
    });

    const feedback = await fetchJson<unknown>(`${baseUrl}/api/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId: conversation.id,
        feedbackGroup: group,
      }),
    });

    const outputFile = path.resolve(
      outputDir,
      `feedback_sanity_${path.basename(transcriptPath, path.extname(transcriptPath))}_${runStamp}_group${group}.json`,
    );

    await writeFile(
      outputFile,
      JSON.stringify(
        {
          meta: {
            baseUrl,
            transcriptPath: path.relative(repoRoot, transcriptPath),
            conversationId: conversation.id,
            conversationNumber,
            feedbackGroupRequested: group,
            runStamp,
          },
          feedback,
        },
        null,
        2,
      ),
      "utf8",
    );

    outputs.push({ group, feedback, outputFile, conversationId: conversation.id });
  }

  const summaryFile = path.resolve(
    outputDir,
    `feedback_sanity_${path.basename(transcriptPath, path.extname(transcriptPath))}_${runStamp}_summary.json`,
  );
  await writeFile(
    summaryFile,
    JSON.stringify(
      {
        meta: {
          baseUrl,
          transcriptPath: path.relative(repoRoot, transcriptPath),
          conversationNumber,
          runStamp,
          messageCount: transcript.length,
        },
        outputs: outputs.map((o) => ({
          group: o.group,
          conversationId: o.conversationId,
          outputFile: path.relative(repoRoot, o.outputFile),
        })),
      },
      null,
      2,
    ),
    "utf8",
  );

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({
    ok: true,
    baseUrl,
    conversationIds: outputs.map((o) => ({ group: o.group, conversationId: o.conversationId })),
    outputFiles: outputs.map((o) => o.outputFile),
    summaryFile,
  }, null, 2));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("run-feedback-sanity failed:", err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
