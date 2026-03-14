import "dotenv/config";
import { runProsodyStep2ForConversation } from "../server/prosody-step2";
import { runProsodyStep3ForConversation } from "../server/prosody-step3";
import { pool } from "../server/db";

async function main() {
  const conversationId = process.argv[2];
  if (!conversationId) {
    throw new Error(
      "Usage: npx tsx scripts/run-prosody-step3.ts <conversationId>",
    );
  }

  console.log("\n=== Step 2: Download + Normalize ===");
  const step2Result = await runProsodyStep2ForConversation(conversationId);
  console.log(JSON.stringify(step2Result, null, 2));

  if (step2Result.failedSegments > 0) {
    console.warn(
      `\nWarning: ${step2Result.failedSegments} segment(s) failed in Step 2. Proceeding with ${step2Result.completedSegments} completed segment(s).`,
    );
  }

  console.log("\n=== Step 3: Prosody Feature Extraction ===");
  const step3Result = await runProsodyStep3ForConversation(conversationId);
  console.log(JSON.stringify(step3Result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
