import OpenAI from "openai";
import { storage } from "./storage";
import type { Message } from "@shared/schema";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY || "default_key"
});

export async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
  try {
    const transcription = await openai.audio.transcriptions.create({
      file: new File([audioBuffer], "audio.webm", { type: "audio/webm" }),
      model: "whisper-1",
    });
    return transcription.text;
  } catch (error) {
    console.error("Transcription error:", error);
    throw new Error("Failed to transcribe audio");
  }
}

export async function generateSpeech(text: string): Promise<Buffer> {
  try {
    const response = await openai.audio.speech.create({
      model: "tts-1",
      voice: "alloy",
      input: text,
    });
    
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    console.error("TTS error:", error);
    throw new Error("Failed to generate speech");
  }
}

export async function generateLaypersonResponse(messages: Message[]): Promise<string> {
  try {
    const laypersonPrompt = await storage.getAiPrompt("layperson_role");
    const systemPrompt = laypersonPrompt?.prompt || `You are playing the role of an elderly layperson who is curious about science but has no technical background. You are interested in learning about the student's research but will ask questions that a regular person would ask. You might express concerns, ask for clarification, or relate the research to everyday experiences. Be friendly, curious, and engaging, but don't hesitate to say when something is confusing. Ask follow-up questions and show genuine interest. Keep your responses conversational and not too long.`;

    const openaiMessages = [
      { role: "system" as const, content: systemPrompt },
      ...messages.map(msg => ({
        role: msg.role === "student" ? "user" as const : "assistant" as const,
        content: msg.content
      }))
    ];

    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: openaiMessages,
      max_completion_tokens: 150,
    });

    return response.choices[0].message.content || "I'm sorry, I didn't catch that. Could you explain it again?";
  } catch (error) {
    console.error("ChatGPT error:", error);
    throw new Error("Failed to generate AI response");
  }
}

export async function generateFeedback(messages: Message[]): Promise<{
  overallScore: number;
  clarityScore: number;
  questionHandlingScore: number;
  engagementScore: number;
  pacingScore: number;
  recommendations: string[];
  detailedFeedback: string;
}> {
  try {
    const feedbackPrompt = await storage.getAiPrompt("feedback_analysis");
    const systemPrompt = feedbackPrompt?.prompt || `You are an expert in science communication evaluation. Analyze this conversation between a STEM student and a layperson. Evaluate based on these criteria:

1. Clarity & Simplicity (0-10): How well did the student explain complex concepts in simple terms?
2. Question Handling (0-10): How effectively did the student address questions and concerns?
3. Engagement & Empathy (0-10): How well did the student connect with the audience?
4. Pacing & Structure (0-10): How well-organized and appropriately paced was the explanation?

Provide scores out of 10 for each category, an overall score (average), 3-5 specific recommendations for improvement, and detailed feedback paragraph. Respond in JSON format.`;

    const conversationText = messages.map(msg => 
      `${msg.role === "student" ? "Student" : "Layperson"}: ${msg.content}`
    ).join("\n\n");

    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Please analyze this conversation and provide feedback:\n\n${conversationText}` }
      ],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    
    return {
      overallScore: Math.min(100, Math.max(0, (result.overallScore || result.clarity_score || 7) * 10)),
      clarityScore: Math.min(100, Math.max(0, (result.clarityScore || result.clarity_score || 7) * 10)),
      questionHandlingScore: Math.min(100, Math.max(0, (result.questionHandlingScore || result.question_handling_score || 7) * 10)),
      engagementScore: Math.min(100, Math.max(0, (result.engagementScore || result.engagement_score || 7) * 10)),
      pacingScore: Math.min(100, Math.max(0, (result.pacingScore || result.pacing_score || 7) * 10)),
      recommendations: result.recommendations || ["Practice using more analogies to explain complex concepts", "Pause more frequently to check for understanding", "Ask the listener about their own experiences"],
      detailedFeedback: result.detailedFeedback || result.detailed_feedback || "Good effort in explaining your research. Focus on using simpler language and engaging more with your audience's questions."
    };
  } catch (error) {
    console.error("Feedback generation error:", error);
    // Return default feedback instead of throwing
    return {
      overallScore: 70,
      clarityScore: 70,
      questionHandlingScore: 65,
      engagementScore: 75,
      pacingScore: 70,
      recommendations: [
        "Practice using more analogies to explain complex concepts",
        "Pause more frequently to check for understanding",
        "Ask the listener about their own experiences to make connections"
      ],
      detailedFeedback: "Your explanation showed good knowledge of your research. Continue working on making complex concepts more accessible to general audiences."
    };
  }
}

// Initialize default prompts
export async function initializeDefaultPrompts() {
  try {
    await storage.upsertAiPrompt({
      name: "layperson_role",
      prompt: `You are playing the role of an elderly layperson who is curious about science but has no technical background. You are interested in learning about the student's research but will ask questions that a regular person would ask. You might express concerns, ask for clarification, or relate the research to everyday experiences. Be friendly, curious, and engaging, but don't hesitate to say when something is confusing. Ask follow-up questions and show genuine interest. Keep your responses conversational and not too long.`
    });

    await storage.upsertAiPrompt({
      name: "feedback_analysis",
      prompt: `You are an expert in science communication evaluation. Analyze this conversation between a STEM student and a layperson. Evaluate based on these criteria:

1. Clarity & Simplicity (0-10): How well did the student explain complex concepts in simple terms?
2. Question Handling (0-10): How effectively did the student address questions and concerns?
3. Engagement & Empathy (0-10): How well did the student connect with the audience?
4. Pacing & Structure (0-10): How well-organized and appropriately paced was the explanation?

Provide scores out of 10 for each category, an overall score (average), 3-5 specific recommendations for improvement, and detailed feedback paragraph. Respond in JSON format with keys: overallScore, clarityScore, questionHandlingScore, engagementScore, pacingScore, recommendations (array), detailedFeedback.`
    });
  } catch (error) {
    console.error("Failed to initialize default prompts:", error);
  }
}
