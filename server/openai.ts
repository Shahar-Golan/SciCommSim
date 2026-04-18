import OpenAI from "openai";
import { initializeChatPrompts } from "./openai-chat";
import { initializeFeedbackPrompts } from "./openai-feedback.ts";

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY || "default_key"
});

export async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
  try {
    const transcription = await openai.audio.transcriptions.create({
      file: new File([new Uint8Array(audioBuffer)], "audio.webm", { type: "audio/webm" }),
      model: "whisper-1",
      // Force English transcription to prevent incorrect language auto-detection.
      language: "en",
    });
    return transcription.text;
  } catch (error) {
    console.error("Transcription error:", error);
    throw new Error("Failed to transcribe audio");
  }
}

export async function generateSpeech(text: string, voice: string = "alloy"): Promise<Buffer> {
  try {
    console.log(`[TTS] Generating speech with ${voice} voice...`);
    const response = await openai.audio.speech.create({
      model: "tts-1",
      voice: voice as any,
      input: text,
    });
    
    console.log(`[TTS] Speech generation complete, converting to buffer...`);
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    console.error("TTS error:", error);
    throw new Error("Failed to generate speech");
  }
}

// Initialize all default prompts
export async function initializeDefaultPrompts() {
  await Promise.all([
    initializeChatPrompts(),
    initializeFeedbackPrompts()
  ]);
}
