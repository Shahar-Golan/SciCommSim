import "dotenv/config";
import { runProsodyStep2ForConversation } from "../server/prosody-step2";
import { pool } from "../server/db";

async function main() {
  const conversationId = process.argv[2];
  if (!conversationId) {
    throw new Error("Usage: npx tsx scripts/run-prosody-step2.ts <conversationId>");
  }

  const result = await runProsodyStep2ForConversation(conversationId);
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
