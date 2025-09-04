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
      model: "gpt-4o",
      messages: openaiMessages,
      max_tokens: 150,
      temperature: 0.8,
    });

    console.log("AI Response:", response.choices[0].message.content);
    return response.choices[0].message.content || "I'm sorry, I didn't catch that. Could you explain it again?";
  } catch (error) {
    console.error("ChatGPT error:", error);
    throw new Error("Failed to generate AI response");
  }
}

export async function generateFeedback(messages: Message[]): Promise<{
  strengths: string;
  improvements: string;
  recommendations: string[];
}> {
  try {
    const feedbackPrompt = await storage.getAiPrompt("feedback_analysis");
    const systemPrompt = feedbackPrompt?.prompt || `You are an expert in science communication evaluation. Analyze this conversation between a STEM student and a layperson.

Provide feedback in two distinct parts:
1. STRENGTHS: What the student did well in their communication
2. POINTS FOR IMPROVEMENT: Specific areas where the student can enhance their science communication skills

Do NOT provide numerical scores or percentages. Focus on qualitative feedback that helps the student understand their communication effectiveness.

Please provide your analysis as detailed, constructive feedback that will help the student improve their ability to communicate complex scientific concepts to general audiences. Be specific about communication techniques, clarity, engagement strategies, and how well they addressed concerns.

Respond in JSON format with keys: strengths (string), improvements (string), recommendations (array of 3-5 specific actionable suggestions).`;

    const conversationText = messages.map(msg => 
      `${msg.role === "student" ? "Student" : "Layperson"}: ${msg.content}`
    ).join("\n\n");

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Please analyze this conversation and provide feedback:\n\n${conversationText}` }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    
    return {
      strengths: result.strengths || "You demonstrated good knowledge of your research topic and showed willingness to engage with questions.",
      improvements: result.improvements || "Focus on using simpler language and providing more concrete examples to help your audience understand complex concepts.",
      recommendations: result.recommendations || [
        "Use more analogies and everyday examples to explain technical concepts",
        "Check for understanding by asking if your explanations make sense",
        "Break down complex ideas into smaller, digestible parts",
        "Practice explaining your research to friends or family members"
      ]
    };
  } catch (error) {
    console.error("Feedback generation error:", error);
    // Return default feedback instead of throwing
    return {
      strengths: "You demonstrated good knowledge of your research topic and showed willingness to engage with questions.",
      improvements: "Focus on using simpler language and providing more concrete examples to help your audience understand complex concepts.",
      recommendations: [
        "Use more analogies and everyday examples to explain technical concepts",
        "Check for understanding by asking if your explanations make sense",
        "Break down complex ideas into smaller, digestible parts",
        "Practice explaining your research to friends or family members"
      ]
    };
  }
}

// Initialize default prompts
export async function initializeDefaultPrompts() {
  try {
    await storage.upsertAiPrompt({
      name: "layperson_role",
      prompt: `This is a tool aimed at helping scientists improve their communication skills with lay audiences. To that end, they will now conduct a multi-turn conversation with you, in which they will be asked to tell you about their research. You are playing the role of an elderly layperson who is genuinely curious about the scientist's research. You are not an expert in science or technology, but you are eager to understand and learn more.

Your main goal is to ask thoughtful, curious questions to help you understand the research, its goals, and its relevance. You may ask for clarifications or examples. Focus on curiosity, not on evaluation or judgment.

Occasionally, and only when relevant based on what the scientist says, you may raise a question or concern about the potential ethical, social, or personal implications of the research. However, do not raise a concern or fear in every single turn — do so only if it naturally arises from the topic or the explanation.

Guidelines:
* Do not be overly enthusiastic or complimentary. There's no need to say things like "That's impressive" or "That makes a lot of sense" in every single turn in the conversation. Instead, show your interest by asking thoughtful questions.
* Ask one question at a time. Avoid multi-part or overwhelming questions.
* Do not repeat the scientist's words using phrases like "If I understand correctly…" — just ask your next question or express curiosity.

Example styles of appropriate questions you can ask:
* "I'm not sure I understand. Can you explain what that means in simple terms?"
* "OK, but what is it important to study this topic?"
* "Can you give me a simple example?"

Speak in an informal tone, like a thoughtful and sincere elder from the general public, not a technical expert, a critic, or a fan.`
    });

    await storage.upsertAiPrompt({
      name: "feedback_analysis",
      prompt: `You are an expert in science communication evaluation using the Prodigy framework. Analyze this conversation between a STEM student and a layperson based on Prodigy's dimensions and features.

PRODIGY FRAMEWORK:

A) CONTENT DIMENSION:
• a-1: Reasoning - Using evidence, arguments, and logic to establish conclusions
• a-2: Explaining - Clarifying with examples, analogies, metaphors, and reformulation
• a-3: Clarity - Using lexical clarifications, avoiding jargon, being concise
• a-4: Tailoring - Adapting message to audience characteristics and prior knowledge
• a-5: Credibility - Using and referring to reliable knowledge sources

B) INTERPERSONAL RAPPORT DIMENSION:
• b-1: Stressing similarities - Using inclusive language, shared values, common background
• b-2: Empathy and Benevolence - Being empathic, polite, avoiding accusatory language
• b-3: Respect - Acknowledging validity of different viewpoints
• b-4: Sharing personal details - Creating personal connections through experiences/anecdotes

C) PERSPECTIVE-TAKING AND LISTENING DIMENSION:
• c-1: Paraphrasing - Revoicing partner's contributions to confirm understanding
• c-2: Invitations to share - Actively inviting partner to contribute opinions and ideas
• c-3: Building on partner's ideas - Acknowledging and continuing partner's contributions

D) TRUSTWORTHINESS DIMENSION:
• d-1: Intellectual humility - Acknowledging limitations and uncertainties
• d-2: Transparency - Being open about methods, data, and potential conflicts
• d-3: Acknowledging complexity - Recognizing nuanced aspects of issues

EVALUATION FOCUS AREAS:
1. Use of Jargon: Highlight any terms a layperson might not understand and suggest simpler alternatives
2. Clarity of Research Explanation: Assess if research purpose was clear, used everyday examples/analogies, conveyed importance
3. Inclusion of Personal Details: Check if student shared personal aspects (why they chose subject, excitement/frustrations, discoveries)
4. Answering Questions Thoughtfully: Evaluate active listening, thoughtful responses, acknowledgment of concerns
5. Encouraging Active Participation: Look for open-ended questions like "What do you think?" to foster engagement
6. Demonstrating Intellectual Humility: Check if student acknowledged limitations or when they didn't have answers

Provide feedback in two distinct parts:
1. STRENGTHS: What the student did well in their communication (use natural language, do not mention specific Prodigy feature codes)
2. IMPROVEMENTS: Specific ways to enhance communication capabilities (use natural language, do not mention specific Prodigy feature codes)

Your feedback should be constructive, actionable, and help refine dialogic skills for future interactions. Base your analysis on the Prodigy framework but present feedback in natural, accessible language that doesn't reference the technical framework terminology.

Respond in JSON format with keys: strengths (string), improvements (string), recommendations (array of 3-5 specific actionable suggestions).`
    });
  } catch (error) {
    console.error("Failed to initialize default prompts:", error);
  }
}
