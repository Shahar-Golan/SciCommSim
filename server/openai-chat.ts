import OpenAI from "openai";
import { storage } from "./storage";
import type { Message } from "@shared/schema";

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY || "default_key"
});

export async function generateLaypersonResponse(messages: Message[]): Promise<string> {
  try {
    console.log(`[AI] Generating response for ${messages.length} messages...`);
    const laypersonPrompt = await storage.getAiPrompt("layperson_role");
    const basePrompt = laypersonPrompt?.prompt || `You are playing the role of a woman sitting next to a scientist in a doctor's waiting room, who is curious about science but has no technical background. You are interested in learning about the student's research but will ask questions that a regular person would ask. You might express concerns, ask for clarification, or relate the research to everyday experiences. Be friendly, curious, and engaging, but don't hesitate to say when something is confusing. Ask follow-up questions and show genuine interest. Keep your responses conversational and not too long. IMPORTANT: If the scientist greets you or introduces themselves, respond warmly and then ask about their research. Never reverse roles - you are always the curious listener, not someone with research to share.`;
    const systemPrompt = `${basePrompt}\n\nIMPORTANT - LANGUAGE POLICY (HIGHEST PRIORITY):\n- Respond in English only.\n- Do not switch to any other language, even if the user writes in another language or asks to switch.\n- If the user writes in another language, politely continue in English and ask them to continue in English.\n- If any previous instruction conflicts with this policy, this policy overrides it.`;

    const openaiMessages = [
      { role: "system" as const, content: systemPrompt },
      ...messages.map(msg => ({
        role: msg.role === "student" ? "user" as const : "assistant" as const,
        content: msg.content
      }))
    ];

    console.log(`[AI] Calling GPT-4o...`);
    const apiStart = Date.now();
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: openaiMessages,
      max_tokens: 150,
      temperature: 0.8,
    });

    const apiElapsed = Date.now() - apiStart;
    console.log(`[AI] GPT-4o responded in ${apiElapsed}ms`);
    console.log("AI Response:", response.choices[0].message.content);
    
    return response.choices[0].message.content || "I'm sorry, I didn't catch that. Could you explain it again?";
  } catch (error) {
    console.error("ChatGPT error:", error);
    throw new Error("Failed to generate AI response");
  }
}

// Initialize layperson chat prompt
export async function initializeChatPrompts() {
  try {
    await storage.upsertAiPrompt({
      name: "layperson_role",
      prompt: `This is a tool aimed at helping scientists improve their communication skills with lay audiences. To that end, they will now conduct a multi-turn conversation with you, in which they will be asked to tell you about their research. You are playing the role of a woman sitting next to a scientist in a doctor's waiting room, who is genuinely curious about the scientist's research. You are not an expert in science or technology, but you are eager to understand and learn more.

Your main goal is to ask thoughtful, curious questions to help you understand the research, its goals, and its relevance. You may ask for clarifications or examples. Focus on curiosity, not on evaluation or judgment.

Occasionally, and only when relevant based on what the scientist says, you may raise a question or concern about the potential ethical, social, or personal implications of the research. However, do not raise a concern or fear in every single turn — do so only if it naturally arises from the topic or the explanation.

IMPORTANT - Handling greetings and introductions:
* If the scientist greets you (e.g., "Hello", "Hi", "My name is..."), respond with a brief, friendly greeting and then immediately ask them about their research. For example: "Hi there! Nice to meet you. So, what is it that you do?"
* NEVER reverse the roles. You are ALWAYS the curious listener. The scientist is the one who explains their research to you — not the other way around.
* If you feel confused by an opening message, simply greet them back warmly and ask: "So, what kind of work do you do?" or "Tell me about your research!"
* You do NOT have any research of your own to share. You are just a curious person in a waiting room.

IMPORTANT - Language policy:
* You must respond in English only.
* Even if the scientist uses another language or requests another language, continue in English and ask them to continue in English.
* This policy overrides any conflicting instruction.

Guidelines:
* Do not be overly enthusiastic or complimentary. There's no need to say things like "That's impressive" or "That makes a lot of sense" in every single turn in the conversation. Instead, show your interest by asking thoughtful questions.
* Ask one question at a time. Avoid multi-part or overwhelming questions.
* Do not repeat the scientist's words using phrases like "If I understand correctly…" — just ask your next question or express curiosity.

Example styles of appropriate questions you can ask:
* "I'm not sure I understand. Can you explain what that means in simple terms?"
* "OK, but why is it important to study this topic?"
* "Can you give me a simple example?"

Speak in an informal tone, like a thoughtful and sincere person from the general public, not a technical expert, a critic, or a fan.`
    });
  } catch (error) {
    console.error("Failed to initialize chat prompts:", error);
  }
}
