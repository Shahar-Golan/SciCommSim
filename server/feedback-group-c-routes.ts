import OpenAI from "openai";
import type { Express } from "express";
import { storage } from "./storage";
import type { FeedbackGroup } from "./openai-feedback";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY || "default_key",
});

type DialogueItem = {
  kind: "strength" | "improvement";
  text: string;
};

type GroupCState = {
  feedback_group: "C";
  feedback_items: DialogueItem[];
};

function parseFeedbackGroup(input: unknown): FeedbackGroup {
  return input === "A" || input === "B" || input === "C" ? input : "C";
}

function extractFeedbackItems(strengths: string | null | undefined, improvements: string | null | undefined): DialogueItem[] {
  const parseBlock = (value: string | null | undefined, kind: DialogueItem["kind"]) => {
    if (!value) return [];
    const lines = value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.replace(/^-\s*/, "").trim())
      .filter(Boolean)
      .map((text) => ({ kind, text } as DialogueItem));

    return lines.length > 0 ? lines : [{ kind, text: value.trim() }];
  };

  return [
    ...parseBlock(strengths, "strength"),
    ...parseBlock(improvements, "improvement"),
  ];
}

function getDefaultGroupCState(feedback: { strengths?: string | null; improvements?: string | null }): GroupCState {
  const feedbackItems = extractFeedbackItems(feedback.strengths, feedback.improvements);

  return {
    feedback_group: "C",
    feedback_items: feedbackItems,
  };
}

function parseGroupCState(summary: string | null, feedback: { strengths?: string | null; improvements?: string | null }): GroupCState {
  const fallback = getDefaultGroupCState(feedback);

  if (!summary) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(summary) as Partial<GroupCState>;
    const isGroupC = parsed.feedback_group === "C";
    if (!isGroupC) {
      return fallback;
    }

    const feedbackItems = Array.isArray(parsed.feedback_items) && parsed.feedback_items.length > 0
      ? parsed.feedback_items.filter((item): item is DialogueItem => {
          if (!item || typeof item !== "object") return false;
          const candidate = item as DialogueItem;
          return (candidate.kind === "strength" || candidate.kind === "improvement") && typeof candidate.text === "string";
        })
      : fallback.feedback_items;

    return {
      feedback_group: "C",
      feedback_items: feedbackItems,
    };
  } catch {
    return fallback;
  }
}

function makeTeacherMessage(content: string) {
  return {
    role: "teacher" as const,
    content,
    timestamp: new Date().toISOString(),
  };
}

export function registerFeedbackGroupCRoutes(app: Express): void {
  app.post("/api/feedback-dialogue/start", async (req, res) => {
    try {
      const feedbackGroup = parseFeedbackGroup(req.body.feedbackGroup);
      if (feedbackGroup !== "C") {
        return res.status(400).json({ message: "Dialogue is only available for Group C" });
      }

      const feedback = await storage.getFeedbackByConversation(req.body.conversationId);
      if (!feedback) {
        return res.status(404).json({ message: "Feedback not found" });
      }

      const state = getDefaultGroupCState(feedback);
      const initialMessage =
        "Great job completing the conversation. We will now review your feedback items one by one.";

      const teacherMessage = makeTeacherMessage(initialMessage);

      await storage.updateFeedback(feedback.id, {
        dialogueTranscript: [teacherMessage] as any,
        summary: JSON.stringify(state),
      });

      res.json({
        message: teacherMessage,
        feedbackId: feedback.id,
      });
    } catch (error) {
      console.error("Failed to start feedback dialogue:", error);
      res.status(500).json({ message: "Failed to start feedback dialogue" });
    }
  });

  app.post("/api/feedback-dialogue/respond", async (req, res) => {
    try {
      const { message } = req.body;

      if (!message || typeof message.content !== "string" || !message.content.trim()) {
        return res.status(400).json({ message: "message.content is required" });
      }

      const feedback = await storage.getFeedbackByConversation(req.body.conversationId);
      if (!feedback) {
        return res.status(404).json({ message: "Feedback not found" });
      }

      const conversation = await storage.getConversation(req.body.conversationId);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      const updatedTranscript = [
        ...(feedback.dialogueTranscript || []),
        message,
      ];

      const state = parseGroupCState(feedback.summary, feedback);

      const strengths = state.feedback_items
        .filter((item) => item.kind === "strength")
        .map((item) => `- ${item.text}`)
        .join("\n");

      const improvements = state.feedback_items
        .filter((item) => item.kind === "improvement")
        .map((item) => `- ${item.text}`)
        .join("\n");

      const originalConversation = (conversation.transcript || [])
        .map((msg) => `${msg.role === "student" ? "Student" : "Layperson"}: ${msg.content}`)
        .join("\n");

      const systemPrompt = `You are an insightful communications teacher reviewing a completed exercise with your student.
Your goal is to guide the student through their feedback naturally and conversationally. Do NOT list all feedback at once. Discuss one or two points at a time, and prompt the student to reflect on how they might apply this advice.

Here is the student's feedback to cover during this session:
Strengths to preserve:
${strengths || "None identified."}

Areas for improvement:
${improvements || "None identified."}

Original conversation transcript:
${originalConversation || "No transcript available."}

Keep your responses concise, conversational, and encouraging. Once all points have been discussed naturally, wrap up the conversation.`;

      const messagesForLLM = [
        { role: "system", content: systemPrompt },
        ...updatedTranscript.map((msg) => ({
          role: msg.role === "teacher" ? "assistant" : "user",
          content: msg.content,
        })),
      ] as any;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: messagesForLLM,
        temperature: 0.7,
      });

      const teacherResponse = completion.choices[0]?.message?.content || "Could you tell me more about your thoughts on that?";

      const teacherMessage = makeTeacherMessage(teacherResponse);

      await storage.updateFeedback(feedback.id, {
        dialogueTranscript: [...updatedTranscript, teacherMessage] as any,
        summary: feedback.summary || JSON.stringify(state),
      });

      res.json({ response: teacherMessage });
    } catch (error) {
      console.error("Failed to generate teacher response:", error);
      res.status(500).json({ message: "Failed to generate teacher response" });
    }
  });

  app.post("/api/feedback-dialogue/complete", async (req, res) => {
    try {
      const feedback = await storage.getFeedbackByConversation(req.body.conversationId);
      if (!feedback) {
        return res.status(404).json({ message: "Feedback not found" });
      }

      await storage.updateFeedback(feedback.id, {
        dialogueCompleted: new Date(),
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Failed to complete feedback dialogue:", error);
      res.status(500).json({ message: "Failed to complete feedback dialogue" });
    }
  });
}
