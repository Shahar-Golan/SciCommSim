import OpenAI from "openai";
import type { Express } from "express";
import { storage } from "./storage";
import { parseFeedbackGroup, type FeedbackGroup } from "./openai-feedback";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY || "default_key",
});

const FEEDBACK_THINKING_MODEL =
  process.env.OPENAI_FEEDBACK_THINKING_MODEL || process.env.OPENAI_FEEDBACK_MODEL || "gpt-5";

const FEEDBACK_THINKING_MODEL_FALLBACK = process.env.OPENAI_FEEDBACK_THINKING_MODEL_FALLBACK || "gpt-4o";

function isModelNotFoundError(error: unknown): boolean {
  return !!error && typeof error === "object" && (error as any).code === "model_not_found";
}

function isTemperatureUnsupportedError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    (error as any).code === "unsupported_value" &&
    (error as any).param === "temperature"
  );
}

type DialogueItem = {
  kind: "strength" | "improvement";
  text: string;
};

type GroupCPhase =
  | "awaiting_reflection"
  | "awaiting_improvement_followup"
  | "awaiting_preserve_followup";

type GroupCState = {
  feedback_group: "C";
  phase: GroupCPhase;
  feedback_json: {
    preserve_points: string[];
    improvement_points: string[];
  };
};

type GroupCStage = "improvements" | "preserves";

type GroupCStagePayload = {
  stage: GroupCStage;
  follow_up_question: string;
  improvement_points?: string[];
  preserve_points?: string[];
};

const GROUP_C_INITIAL_QUESTION = "Great job completing the first conversation. Before I share my feedback, I’d love to hear your perspective: how do you think it went?";
const GROUP_C_FEEDBACK_INTRO_MESSAGE = "Interesting thoughts. Here is my feedback for you.";
const GROUP_C_IMPROVEMENT_FOLLOW_UP = "Is there anything you’d like to ask, clarify, or explore further regarding the feedback I provided?";
const GROUP_C_PRESERVE_FOLLOW_UP = "Would you like an explanation or expansion regarding these points?";

function formatTeacherPayload(prefix: string, payload: GroupCStagePayload): string {
  return `${prefix}\n\n${JSON.stringify(payload, null, 2)}`;
}

function buildStagePayload(state: GroupCState, stage: GroupCStage): GroupCStagePayload {
  if (stage === "improvements") {
    return {
      stage,
      follow_up_question: GROUP_C_IMPROVEMENT_FOLLOW_UP,
      improvement_points: state.feedback_json.improvement_points,
    };
  }

  return {
    stage,
    follow_up_question: GROUP_C_PRESERVE_FOLLOW_UP,
    preserve_points: state.feedback_json.preserve_points,
  };
}

function isClosureSignal(message: string): boolean {
  const normalized = message.toLowerCase().replace(/\s+/g, " ").trim();

  if (normalized.includes("?")) {
    return false;
  }

  return /\b(understood|understand|got it|no questions?|nothing else|all clear|that's all|thank you|thanks|okay|ok|sounds good)\b/.test(normalized);
}

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

    const parsedPhase = parsed.phase as string | undefined;
    const phase: GroupCPhase =
      parsedPhase === "feedback_delivered"
        ? "awaiting_preserve_followup"
        :
      parsedPhase === "awaiting_improvement_followup" || parsedPhase === "awaiting_preserve_followup"
        ? parsedPhase
        : "awaiting_reflection";

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
        const teacherResponse = formatTeacherPayload(
          GROUP_C_FEEDBACK_INTRO_MESSAGE,
          buildStagePayload(state, "improvements")
        );
        const teacherMessage = makeTeacherMessage(teacherResponse);

        const nextState: GroupCState = {
          ...state,
          phase: "awaiting_improvement_followup",
        };

        await storage.updateFeedback(feedback.id, {
          dialogueTranscript: [...updatedTranscript, teacherMessage] as any,
          summary: JSON.stringify(nextState),
        });

        return res.json({ response: teacherMessage });
      }

      if (state.phase === "awaiting_improvement_followup" && isClosureSignal(message.content)) {
        const teacherResponse = formatTeacherPayload(
          GROUP_C_FEEDBACK_INTRO_MESSAGE,
          buildStagePayload(state, "preserves")
        );
        const teacherMessage = makeTeacherMessage(teacherResponse);

        const nextState: GroupCState = {
          ...state,
          phase: "awaiting_preserve_followup",
        };

        await storage.updateFeedback(feedback.id, {
          dialogueTranscript: [...updatedTranscript, teacherMessage] as any,
          summary: JSON.stringify(nextState),
        });

        return res.json({ response: teacherMessage });
      }

      if (state.phase === "awaiting_preserve_followup" && isClosureSignal(message.content)) {
        const teacherMessage = makeTeacherMessage(
          "Thanks for reflecting on the feedback. If you want to revisit anything later, I’m here to help."
        );

        await storage.updateFeedback(feedback.id, {
          dialogueTranscript: [...updatedTranscript, teacherMessage] as any,
          summary: JSON.stringify(state),
        });

        return res.json({ response: teacherMessage });
      }

      const originalConversation = (conversation.transcript || [])
        .map((msg) => `${msg.role === "student" ? "Student" : "Layperson"}: ${msg.content}`)
        .join("\n");

      const stageLabel = state.phase === "awaiting_preserve_followup" ? "preserve points" : "improvement points";
      const feedbackPoints =
        state.phase === "awaiting_preserve_followup"
          ? state.feedback_json.preserve_points
          : state.feedback_json.improvement_points;

      const systemPrompt = `You are an insightful science communication coach reviewing a completed exercise with your student.

    You have already asked the student "${GROUP_C_INITIAL_QUESTION}" and then provided the following ${stageLabel}.
    Continue the conversation as a helpful coach:
    - Answer the student's questions or disagreements based on the full chat context.
    - Do not invent new feedback points beyond what is in the JSON (you may clarify, elaborate, or give examples).
    - Do not advance to the other feedback stage unless the student clearly says they understand or do not have more questions.
    - Keep your responses concise, conversational, and encouraging.

    Feedback points already sent to the student:
    ${JSON.stringify(feedbackPoints, null, 2)}

    Original conversation transcript (for grounding quotes/context):
    ${originalConversation || "No transcript available."}`;

      const messagesForLLM = [
        { role: "system", content: systemPrompt },
        ...updatedTranscript.map((msg) => ({
          role: msg.role === "teacher" ? "assistant" : "user",
          content: msg.content,
        })),
      ] as any;

      const requestOnce = async (model: string) => {
        try {
          return await openai.chat.completions.create({
            model,
            messages: messagesForLLM,
            temperature: 0.7,
          });
        } catch (error) {
          if (isTemperatureUnsupportedError(error)) {
            console.warn(
              `[AI] Model '${model}' does not support non-default temperature; retrying without temperature.`
            );
            return await openai.chat.completions.create({
              model,
              messages: messagesForLLM,
            });
          }
          throw error;
        }
      };

      let completion;
      let usedModel = FEEDBACK_THINKING_MODEL;
      try {
        completion = await requestOnce(FEEDBACK_THINKING_MODEL);
      } catch (error) {
        if (
          isModelNotFoundError(error) &&
          FEEDBACK_THINKING_MODEL_FALLBACK &&
          FEEDBACK_THINKING_MODEL_FALLBACK !== FEEDBACK_THINKING_MODEL
        ) {
          console.warn(
            `[AI] Feedback dialogue model '${FEEDBACK_THINKING_MODEL}' not available (model_not_found). Falling back to '${FEEDBACK_THINKING_MODEL_FALLBACK}'.`
          );
          usedModel = FEEDBACK_THINKING_MODEL_FALLBACK;
          completion = await requestOnce(FEEDBACK_THINKING_MODEL_FALLBACK);
        } else {
          throw error;
        }
      }

      console.log(`[AI] Feedback dialogue used model '${usedModel}'.`);

      const teacherResponse = completion.choices[0]?.message?.content || "Could you tell me more about your thoughts on that?";

      const teacherMessage = makeTeacherMessage(teacherResponse);

      await storage.updateFeedback(feedback.id, {
        dialogueTranscript: [...updatedTranscript, teacherMessage] as any,
        summary: JSON.stringify(state),
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
