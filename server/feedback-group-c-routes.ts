import OpenAI from "openai";
import type { Express } from "express";
import { storage } from "./storage";
import { parseFeedbackGroup, type FeedbackGroup } from "./openai-feedback";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY || "default_key",
});

type DialogueItem = {
  kind: "strength" | "improvement";
  text: string;
};

type GroupCState = {
  feedback_group: "C";
  phase: "awaiting_reflection" | "feedback_delivered";
  feedback_json: {
    preserve_points: string[];
    improvement_points: string[];
  };
};

const GROUP_C_INITIAL_QUESTION = "how the conversation went";
const GROUP_C_FEEDBACK_INTRO_MESSAGE = "interseting toughts', here is my feedback for you";

function parseFormattedPointsBlock(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }

  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);

  if (lines.length > 0) {
    return lines;
  }

  return [value.trim()];
}

function normalizeRequiredPoints(points: string[], requiredCount: number, fallbackPrefix: string): string[] {
  const trimmed = points
    .map((point) => point.trim())
    .filter(Boolean)
    .slice(0, requiredCount);

  while (trimmed.length < requiredCount) {
    trimmed.push(`${fallbackPrefix} ${trimmed.length + 1}.`);
  }

  return trimmed;
}

function getFeedbackGroupFromSummary(summary: string | null | undefined): FeedbackGroup | null {
  if (!summary) {
    return null;
  }

  try {
    const parsed = JSON.parse(summary) as { feedback_group?: unknown };
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parseFeedbackGroup(parsed.feedback_group);
  } catch {
    return null;
  }
}

function getDefaultGroupCState(feedback: { strengths?: string | null; improvements?: string | null }): GroupCState {
  const preserve = parseFormattedPointsBlock(feedback.strengths);
  const improve = parseFormattedPointsBlock(feedback.improvements);

  return {
    feedback_group: "C",
    phase: "awaiting_reflection",
    feedback_json: {
      preserve_points: normalizeRequiredPoints(
        preserve,
        2,
        "Preserve: continue using audience-aware communication behavior"
      ),
      improvement_points: normalizeRequiredPoints(
        improve,
        3,
        "Improve: simplify and clarify your message for a lay audience"
      ),
    },
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

    const phase = parsed.phase === "feedback_delivered" ? "feedback_delivered" : "awaiting_reflection";

    const preserve = Array.isArray(parsed.feedback_json?.preserve_points)
      ? parsed.feedback_json?.preserve_points.filter((item): item is string => typeof item === "string")
      : [];

    const improve = Array.isArray(parsed.feedback_json?.improvement_points)
      ? parsed.feedback_json?.improvement_points.filter((item): item is string => typeof item === "string")
      : [];

    const preserve_points = preserve.length > 0
      ? normalizeRequiredPoints(preserve, 2, "Preserve: continue using audience-aware communication behavior")
      : fallback.feedback_json.preserve_points;

    const improvement_points = improve.length > 0
      ? normalizeRequiredPoints(improve, 3, "Improve: simplify and clarify your message for a lay audience")
      : fallback.feedback_json.improvement_points;

    return {
      feedback_group: "C",
      phase,
      feedback_json: {
        preserve_points,
        improvement_points,
      },
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
      const initialMessage = GROUP_C_INITIAL_QUESTION;

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

      const summaryGroup = getFeedbackGroupFromSummary(feedback.summary);
      if (summaryGroup !== "C") {
        return res.status(400).json({ message: "Dialogue is only available for Group C" });
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

      if (state.phase === "awaiting_reflection") {
        const teacherResponse = `${GROUP_C_FEEDBACK_INTRO_MESSAGE}\n\n${JSON.stringify(state.feedback_json, null, 2)}`;
        const teacherMessage = makeTeacherMessage(teacherResponse);

        const nextState: GroupCState = {
          ...state,
          phase: "feedback_delivered",
        };

        await storage.updateFeedback(feedback.id, {
          dialogueTranscript: [...updatedTranscript, teacherMessage] as any,
          summary: JSON.stringify(nextState),
        });

        return res.json({ response: teacherMessage });
      }

      const originalConversation = (conversation.transcript || [])
        .map((msg) => `${msg.role === "student" ? "Student" : "Layperson"}: ${msg.content}`)
        .join("\n");

      const systemPrompt = `You are an insightful science communication coach reviewing a completed exercise with your student.

    You have already asked the student "${GROUP_C_INITIAL_QUESTION}" and then provided the following feedback JSON.
    Continue the conversation as a helpful coach:
    - Answer the student's questions or disagreements based on the full chat context.
    - Do not invent new feedback points beyond what is in the JSON (you may clarify, elaborate, or give examples).
    - Keep your responses concise, conversational, and encouraging.

    Feedback JSON (already sent to the student):
    ${JSON.stringify(state.feedback_json, null, 2)}

    Original conversation transcript (for grounding quotes/context):
    ${originalConversation || "No transcript available."}`;

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

      const summaryGroup = getFeedbackGroupFromSummary(feedback.summary);
      if (summaryGroup !== "C") {
        return res.status(400).json({ message: "Dialogue is only available for Group C" });
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
