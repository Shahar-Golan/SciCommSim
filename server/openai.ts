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
      summary: result.summary || "Overall, your communication was effective and approachable. Keep practicing to further improve your skills!"
    };
  } catch (error) {
    console.error("Feedback generation error:", error);
    // Return default feedback instead of throwing
    return {
      strengths: "You demonstrated good knowledge of your research topic and showed willingness to engage with questions.",
      improvements: "Focus on using simpler language and providing more concrete examples to help your audience understand complex concepts.",
      summary: "Overall, your communication was effective and approachable. Keep practicing to further improve your skills!"
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
      prompt: `At the end of the conversation, you will provide short, constructive feedback to the scientist based on the Prodigy framework. Your goal is to help them improve their science communication skills in future conversations with lay audiences.

Guidelines:
1. Your feedback should be written in the second person (e.g., "You did a great job…", not "The scientist did a great job…").
2. Your feedback should be brief:
   – 1 to 2 strengths (what they did well)
   – 1 to 2 areas for improvement (specific, actionable suggestions)
3. Do not try to cover all 15 features of the Prodigy framework. Focus only on the main things you actually noticed in the conversation.
4. For each strength or suggestion, provide a brief quote or example from the transcript of the conversation to support your point. This ensures relevance and helpfulness.
5. Avoid vague praise or generic criticism. Make the feedback specific, relevant, and grounded in what actually occurred.
6. Although your feedback is informed by the Prodigy framework, you should not mention the framework or its feature codes explicitly. Simply describe the strengths and areas for improvement in everyday language.

Reminder: Your job is to help the scientist improve. Be concise, practical, and focused on what actually happened in the conversation.

PRODIGY FRAMEWORK REFERENCE:
The Prodigy framework includes 15 features across 4 dimensions:
A) Content: Reasoning, Explaining, Clarity, Tailoring, Credibility
B) Interpersonal Rapport: Stressing similarities, Empathy/Benevolence, Respect, Sharing personal details
C) Perspective-taking: Paraphrasing, Invitations to share, Building on ideas
D) Trustworthiness: Intellectual humility, Transparency, Acknowledging complexity

Example feedback format:
"Here's some feedback based on your communication:

Strengths:
• You explained complex concepts like fluid behavior in a simple, understandable way.
• You provided relatable examples, like the meniscus shape of a lens, which helped connect the ideas.

Areas for Improvement:
• A touch more acknowledgment of how challenging the subject might seem could build rapport further.
• You could enhance engagement by asking questions about what the listener might already know."

Respond in JSON format with keys: strengths (string), improvements (string), summary (string - a brief encouraging overall summary like "Overall, your communication was effective and approachable. Great job!" or "Overall, you're doing a really good job explaining your research. These small adjustments can make your explanations even more engaging and impactful. Keep up the great work!").`
    });
  } catch (error) {
    console.error("Failed to initialize default prompts:", error);
  }
}
