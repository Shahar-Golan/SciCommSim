import { runProsodyStep2ForConversation } from "./prosody-step2";
import { runProsodyStep3ForConversation } from "./prosody-step3";

const runningConversations = new Set<string>();

export async function runProsodyPipelineForConversation(conversationId: string): Promise<void> {
  if (runningConversations.has(conversationId)) {
    console.log(`[PROSODY] Pipeline already running for conversation ${conversationId}, skipping duplicate trigger`);
    return;
  }

  runningConversations.add(conversationId);
  try {
    console.log(`[PROSODY] Pipeline started for conversation ${conversationId}`);

    const step2 = await runProsodyStep2ForConversation(conversationId);
    console.log(
      `[PROSODY] Step 2 finished for ${conversationId}: ${step2.completedSegments}/${step2.totalSegments} completed`,
    );

    if (step2.completedSegments === 0) {
      console.warn(
        `[PROSODY] Step 3 skipped for ${conversationId} because Step 2 produced no completed segments`,
      );
      return;
    }

    const step3 = await runProsodyStep3ForConversation(conversationId);
    console.log(
      `[PROSODY] Step 3 finished for ${conversationId}: ${step3.completedSegments}/${step3.totalSegments} completed`,
    );
  } catch (error) {
    console.error(`[PROSODY] Pipeline failed for conversation ${conversationId}:`, error);
  } finally {
    runningConversations.delete(conversationId);
  }
}
