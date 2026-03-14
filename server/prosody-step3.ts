import { spawn } from "child_process";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { prosodyJobs, prosodySegmentMetrics } from "@shared/schema";
import { storage } from "./storage";

type Step3Result = {
  conversationId: string;
  jobId: string;
  totalSegments: number;
  completedSegments: number;
  failedSegments: number;
};

function runCommand(
  command: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });

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
        reject(
          new Error(`${command} exited with code ${code}. ${stderr || stdout}`),
        );
      }
    });
  });
}

async function runPythonAnalyzer(
  inputPath: string,
): Promise<Record<string, unknown>> {
  const scriptPath = "python_files/analyze_prosody_segment.py";
  const candidates: Array<{ cmd: string; args: string[] }> = [
    {
      cmd: "python",
      args: [scriptPath, "--input", inputPath],
    },
    {
      cmd: "python3",
      args: [scriptPath, "--input", inputPath],
    },
    {
      cmd: "py",
      args: ["-3", scriptPath, "--input", inputPath],
    },
  ];

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      const { stdout } = await runCommand(candidate.cmd, candidate.args);
      const normalizedStdout = stdout.trim();
      const jsonLine =
        normalizedStdout.split(/\r?\n/).filter(Boolean).slice(-1)[0] || "{}";
      return JSON.parse(jsonLine);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Failed to run Python prosody analyzer");
}

export async function runProsodyStep3ForConversation(
  conversationId: string,
): Promise<Step3Result> {
  const job = await storage.getProsodyJobByConversation(conversationId);
  if (!job) {
    throw new Error(
      `No prosody job found for conversation ${conversationId}. Run Step 2 first.`,
    );
  }

  const segments = await storage.listProsodySegmentsByConversation(conversationId);

  // Only process segments that have a normalizedPath written by Step 2.
  const step2Segments = segments.filter((seg) => {
    const step2 = (seg.rawMetrics as Record<string, unknown> | null)?.step2;
    return (
      step2 &&
      typeof (step2 as Record<string, unknown>).normalizedPath === "string"
    );
  });

  if (step2Segments.length === 0) {
    throw new Error(
      `No Step-2 normalized segments found for conversation ${conversationId}. Run Step 2 first.`,
    );
  }

  await db
    .update(prosodyJobs)
    .set({
      status: "running",
      startedAt: new Date(),
      finishedAt: null,
      error: null,
      updatedAt: new Date(),
    })
    .where(eq(prosodyJobs.id, job.id));

  let completedSegments = 0;
  let failedSegments = 0;

  for (const segment of step2Segments) {
    const step2Data = (
      segment.rawMetrics as Record<string, unknown>
    ).step2 as Record<string, unknown>;
    const normalizedPath = step2Data.normalizedPath as string;

    try {
      await db
        .update(prosodySegmentMetrics)
        .set({ status: "running", error: null, updatedAt: new Date() })
        .where(eq(prosodySegmentMetrics.id, segment.id));

      const analyzerResult = await runPythonAnalyzer(normalizedPath);

      if (!analyzerResult.ok) {
        throw new Error(
          (analyzerResult.error as string) || "Analyzer returned ok=false",
        );
      }

      const rawMetrics = {
        ...(segment.rawMetrics || {}),
        step3: analyzerResult,
      };

      await db
        .update(prosodySegmentMetrics)
        .set({
          status: "completed",
          error: null,
          pitchMeanHz: String(analyzerResult.pitchMeanHz ?? 0),
          pitchRangeHz: String(analyzerResult.pitchRangeHz ?? 0),
          energyVariance: String(analyzerResult.energyVariance ?? 0),
          longPauseCount: Number(analyzerResult.longPauseCount ?? 0),
          pauseFreqPerMin: String(analyzerResult.pauseFreqPerMin ?? 0),
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
          error:
            error instanceof Error ? error.message : "Unknown step3 error",
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
      error:
        failedSegments > 0
          ? `${failedSegments} segment(s) failed in step 3`
          : null,
    })
    .where(eq(prosodyJobs.id, job.id));

  return {
    conversationId,
    jobId: job.id,
    totalSegments: step2Segments.length,
    completedSegments,
    failedSegments,
  };
}
