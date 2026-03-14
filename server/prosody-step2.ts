import { promises as fs } from "fs";
import path from "path";
import { spawn } from "child_process";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { prosodyJobs, prosodySegmentMetrics } from "@shared/schema";
import { storage } from "./storage";

type Step2Result = {
  conversationId: string;
  jobId: string;
  totalSegments: number;
  processedSegments: number;
  completedSegments: number;
  failedSegments: number;
  outputDir: string;
};

function inferExtensionFromUrl(audioUrl: string): string {
  try {
    const pathname = new URL(audioUrl).pathname.toLowerCase();
    if (pathname.endsWith(".webm")) return "webm";
    if (pathname.endsWith(".mp3")) return "mp3";
    if (pathname.endsWith(".wav")) return "wav";
    if (pathname.endsWith(".ogg")) return "ogg";
  } catch {
    // Ignore parse errors and use fallback.
  }
  return "bin";
}

function runCommand(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`${command} exited with code ${code}. ${stderr || stdout}`));
      }
    });
  });
}

async function runPythonNormalize(inputPath: string, outputPath: string): Promise<Record<string, unknown>> {
  const scriptPath = path.join("python_files", "normalize_audio.py");
  const candidates: Array<{ cmd: string; args: string[] }> = [
    {
      cmd: "python",
      args: [scriptPath, "--input", inputPath, "--output", outputPath],
    },
    {
      cmd: "python3",
      args: [scriptPath, "--input", inputPath, "--output", outputPath],
    },
    {
      cmd: "py",
      args: ["-3", scriptPath, "--input", inputPath, "--output", outputPath],
    },
  ];

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      const { stdout } = await runCommand(candidate.cmd, candidate.args);
      const normalizedStdout = stdout.trim();
      const jsonLine = normalizedStdout.split(/\r?\n/).filter(Boolean).slice(-1)[0] || "{}";
      return JSON.parse(jsonLine);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Failed to run Python normalizer");
}

export async function runProsodyStep2ForConversation(conversationId: string): Promise<Step2Result> {
  const job = (await storage.getProsodyJobByConversation(conversationId))
    ?? (await storage.enqueueProsodyJobForConversation(conversationId));

  if (!job) {
    throw new Error(`Conversation ${conversationId} not found`);
  }

  const segments = await storage.listProsodySegmentsByConversation(conversationId);

  const baseOutputDir = path.join(process.cwd(), "tmp", "prosody", conversationId);
  const sourceDir = path.join(baseOutputDir, "source");
  const normalizedDir = path.join(baseOutputDir, "normalized");

  await fs.mkdir(sourceDir, { recursive: true });
  await fs.mkdir(normalizedDir, { recursive: true });

  await db
    .update(prosodyJobs)
    .set({
      status: "running",
      processedSegments: 0,
      error: null,
      startedAt: new Date(),
      finishedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(prosodyJobs.id, job.id));

  let completedSegments = 0;
  let failedSegments = 0;

  for (const segment of segments) {
    try {
      await db
        .update(prosodySegmentMetrics)
        .set({ status: "running", error: null, updatedAt: new Date() })
        .where(eq(prosodySegmentMetrics.id, segment.id));

      const response = await fetch(segment.sourceAudioUrl);
      if (!response.ok) {
        throw new Error(`Failed to download audio (${response.status})`);
      }

      const contentType = response.headers.get("content-type") || "application/octet-stream";
      const audioBuffer = Buffer.from(await response.arrayBuffer());

      const ext = inferExtensionFromUrl(segment.sourceAudioUrl);
      const sourceFilename = `segment_${String(segment.segmentIndex).padStart(3, "0")}.${ext}`;
      const sourcePath = path.join(sourceDir, sourceFilename);
      await fs.writeFile(sourcePath, audioBuffer);

      const normalizedFilename = `segment_${String(segment.segmentIndex).padStart(3, "0")}.wav`;
      const normalizedPath = path.join(normalizedDir, normalizedFilename);
      const normalizeResult = await runPythonNormalize(sourcePath, normalizedPath);

      const rawMetrics = {
        ...(segment.rawMetrics || {}),
        step2: {
          sourcePath,
          normalizedPath,
          sourceSizeBytes: audioBuffer.length,
          sourceContentType: contentType,
          normalizeResult,
        },
      };

      await db
        .update(prosodySegmentMetrics)
        .set({
          status: "completed",
          error: null,
          rawMetrics,
          updatedAt: new Date(),
        })
        .where(eq(prosodySegmentMetrics.id, segment.id));

      completedSegments += 1;
    } catch (error) {
      failedSegments += 1;
      await db
        .update(prosodySegmentMetrics)
        .set({
          status: "failed",
          error: error instanceof Error ? error.message : "Unknown step2 error",
          updatedAt: new Date(),
        })
        .where(eq(prosodySegmentMetrics.id, segment.id));
    } finally {
      await db
        .update(prosodyJobs)
        .set({
          processedSegments: completedSegments + failedSegments,
          updatedAt: new Date(),
        })
        .where(eq(prosodyJobs.id, job.id));
    }
  }

  const finalStatus = failedSegments > 0 ? "failed" : "completed";

  await db
    .update(prosodyJobs)
    .set({
      status: finalStatus,
      processedSegments: completedSegments + failedSegments,
      finishedAt: new Date(),
      updatedAt: new Date(),
      error: failedSegments > 0 ? `${failedSegments} segment(s) failed in step 2` : null,
    })
    .where(eq(prosodyJobs.id, job.id));

  return {
    conversationId,
    jobId: job.id,
    totalSegments: segments.length,
    processedSegments: completedSegments + failedSegments,
    completedSegments,
    failedSegments,
    outputDir: baseOutputDir,
  };
}
