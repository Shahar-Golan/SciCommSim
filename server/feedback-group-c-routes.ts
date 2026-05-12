import OpenAI from "openai";
import type { Express } from "express";
import { storage } from "./storage";
import { parseFeedbackGroup, type FeedbackGroup } from "./openai-feedback";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY || "default_key",
});

type GroupCPhase = "awaiting_expand_decision" | "discussing_point" | "completed";

type GroupCStage = "improvements" | "preserves";

type GroupCState = {
  feedback_group: "C";
  phase: GroupCPhase;
  current_stage: GroupCStage;
  current_index: number;
  feedback_json: {
    preserve_points: string[];
    improvement_points: string[];
  };
};

type GroupCStagePayload = {
  stage: GroupCStage;
  follow_up_question: string;
  improvement_points?: string[];
  preserve_points?: string[];
};

const GROUP_C_EXPAND_PROMPT = "Would you like to expand on this point?";
const GROUP_C_DONE_MESSAGE =
  "That's all the feedback comments. Thanks for reflecting — if you want to revisit anything later, I’m here to help.";

const GROUP_C_IMPROVEMENT_FOLLOWUPS = [
  "If you’d like, tell me what you meant in that moment or what you’d change — I’ll help you make it clearer for a layperson.",
  "Want to unpack this a bit? What were you trying to communicate there, and what’s one simpler way you could phrase it for a non-expert?",
  "If you’re up for it, share a sentence you might say instead — I can help you refine it so it lands better with a lay audience.",
];

const GROUP_C_PRESERVE_FOLLOWUPS = [
  "Want to reflect on this strength? Share what you did that worked (and how you can repeat it next time).",
  "If you’d like, describe what you did here that was effective — and one concrete way you can intentionally do it again in future conversations.",
];

function getGroupCFollowUpQuestion(stage: GroupCStage, index: number): string {
  const safeIndex = Number.isFinite(index) ? Math.max(0, Math.floor(index)) : 0;

  if (stage === "preserves") {
    return GROUP_C_PRESERVE_FOLLOWUPS[safeIndex % GROUP_C_PRESERVE_FOLLOWUPS.length] ?? GROUP_C_EXPAND_PROMPT;
  }

  return GROUP_C_IMPROVEMENT_FOLLOWUPS[safeIndex % GROUP_C_IMPROVEMENT_FOLLOWUPS.length] ?? GROUP_C_EXPAND_PROMPT;
}

function formatTeacherPayload(prefix: string, payload: GroupCStagePayload): string {
  return `${prefix}\n\n${JSON.stringify(payload, null, 2)}`;
}

function buildPointPayload(stage: GroupCStage, point: string, index: number): GroupCStagePayload {
  if (stage === "preserves") {
    return {
      stage,
      follow_up_question: getGroupCFollowUpQuestion(stage, index),
      preserve_points: [point],
      improvement_points: [],
    };
  }

  return {
    stage,
    follow_up_question: getGroupCFollowUpQuestion(stage, index),
    improvement_points: [point],
    preserve_points: [],
  };
}

function makeTeacherMessage(content: string) {
  return {
    role: "teacher" as const,
    content,
    timestamp: new Date().toISOString(),
  };
}

function parseFormattedPointsBlock(value: string | null | undefined): string[] {
  if (!value) return [];

  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);

  return lines.length > 0 ? lines : [value.trim()];
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
  if (!summary) return null;
  try {
    const parsed = JSON.parse(summary) as { feedback_group?: unknown };
    if (!parsed || typeof parsed !== "object") return null;
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
    phase: "discussing_point",
    current_stage: "improvements",
    current_index: 0,
    feedback_json: {
      preserve_points: normalizeRequiredPoints(
        preserve,
        2,
        "Preserve: continue using audience-aware communication behavior",
      ),
      improvement_points: normalizeRequiredPoints(
        improve,
        3,
        "Improve: simplify and clarify your message for a lay audience",
      ),
    },
  };
}

function parseGroupCState(
  summary: string | null,
  feedback: { strengths?: string | null; improvements?: string | null },
): GroupCState {
  const fallback = getDefaultGroupCState(feedback);
  if (!summary) return fallback;

  try {
    const parsed = JSON.parse(summary) as Partial<GroupCState>;
    if (parsed.feedback_group !== "C") return fallback;

    const parsedPhase = parsed.phase as string | undefined;
    const phase: GroupCPhase =
      parsedPhase === "completed"
        ? "completed"
        : parsedPhase === "discussing_point" || parsedPhase === "awaiting_expand_decision"
          ? "discussing_point"
          : fallback.phase;

    const parsedStage = parsed.current_stage as string | undefined;
    const current_stage: GroupCStage =
      parsedStage === "improvements" || parsedStage === "preserves" ? parsedStage : fallback.current_stage;

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

    const index = typeof parsed.current_index === "number" && Number.isFinite(parsed.current_index)
      ? Math.max(0, Math.floor(parsed.current_index))
      : fallback.current_index;

    const stageLength = current_stage === "preserves" ? preserve_points.length : improvement_points.length;
    const normalizedIndex = stageLength > 0 ? Math.min(index, stageLength - 1) : 0;

    return {
      feedback_group: "C",
      phase,
      current_stage,
      current_index: normalizedIndex,
      feedback_json: {
        preserve_points,
        improvement_points,
      },
    };
  } catch {
    return fallback;
  }
}

function tryExtractFeedbackPointForLLM(content: string): { prefix: string; point: string } | null {
  const firstBrace = content.indexOf("{");
  const lastBrace = content.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  const prefix = content.slice(0, firstBrace).trim();
  const jsonText = content.slice(firstBrace, lastBrace + 1);

  try {
    const parsed = JSON.parse(jsonText) as Partial<GroupCStagePayload>;
    if (!parsed || typeof parsed !== "object") return null;

    const improvement = Array.isArray(parsed.improvement_points) ? parsed.improvement_points[0] : undefined;
    const preserve = Array.isArray(parsed.preserve_points) ? parsed.preserve_points[0] : undefined;
    const point = typeof improvement === "string" ? improvement : typeof preserve === "string" ? preserve : "";
    if (!point) return null;

    return { prefix, point };
  } catch {
    return null;
  }
}

function makeCurrentPointMessage(state: GroupCState) {
  const list = state.current_stage === "preserves"
    ? state.feedback_json.preserve_points
    : state.feedback_json.improvement_points;
  const total = list.length;
  const index = total > 0 ? Math.min(state.current_index, total - 1) : 0;
  const point = list[index] || "";

  const label = state.current_stage === "preserves" ? "Strength to preserve" : "Improvement";
  const prefix = total > 0 ? `${label} ${index + 1} of ${total}` : "Feedback";

  return makeTeacherMessage(formatTeacherPayload(prefix, buildPointPayload(state.current_stage, point, index)));
}

function buildAdvanceResult(state: GroupCState): {
  nextState: GroupCState;
  teacherMessage: ReturnType<typeof makeTeacherMessage>;
  done: boolean;
} {
  const list = state.current_stage === "preserves"
    ? state.feedback_json.preserve_points
    : state.feedback_json.improvement_points;
  const total = list.length;
  const nextIndex = state.current_index + 1;

  // When the current stage list is empty, treat it as exhausted immediately.
  const isExhausted = total === 0 || nextIndex >= total;

  if (!isExhausted) {
    const nextState: GroupCState = {
      ...state,
      phase: "discussing_point",
      current_index: nextIndex,
    };
    return { nextState, teacherMessage: makeCurrentPointMessage(nextState), done: false };
  }

  // Move from improvements -> preserves.
  if (state.current_stage === "improvements") {
    const preserveTotal = state.feedback_json.preserve_points.length;
    if (preserveTotal === 0) {
      const nextState: GroupCState = {
        ...state,
        phase: "completed",
        current_stage: "preserves",
        current_index: 0,
      };
      return { nextState, teacherMessage: makeTeacherMessage(GROUP_C_DONE_MESSAGE), done: true };
    }

    const nextState: GroupCState = {
      ...state,
      phase: "discussing_point",
      current_stage: "preserves",
      current_index: 0,
    };
    return { nextState, teacherMessage: makeCurrentPointMessage(nextState), done: false };
  }

  // Preserves exhausted -> completed.
  const nextState: GroupCState = {
    ...state,
    phase: "completed",
  };
  return { nextState, teacherMessage: makeTeacherMessage(GROUP_C_DONE_MESSAGE), done: true };
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
      const teacherMessage = makeCurrentPointMessage(state);

      await storage.updateFeedback(feedback.id, {
        dialogueTranscript: [teacherMessage] as any,
        summary: JSON.stringify(state),
      });

      res.json({
        message: teacherMessage,
        feedbackId: feedback.id,
        done: false,
        stage: state.current_stage,
        currentIndex: state.current_index,
        total: state.current_stage === "preserves"
          ? state.feedback_json.preserve_points.length
          : state.feedback_json.improvement_points.length,
      });
    } catch (error) {
      console.error("Failed to start feedback dialogue:", error);
      res.status(500).json({ message: "Failed to start feedback dialogue" });
    }
  });

  app.post("/api/feedback-dialogue/next", async (req, res) => {
    try {
      const feedback = await storage.getFeedbackByConversation(req.body.conversationId);
      if (!feedback) {
        return res.status(404).json({ message: "Feedback not found" });
      }

      const summaryGroup = getFeedbackGroupFromSummary(feedback.summary);
      if (summaryGroup !== "C") {
        return res.status(400).json({ message: "Dialogue is only available for Group C" });
      }

      const state = parseGroupCState(feedback.summary, feedback);
      const transcript = [...(feedback.dialogueTranscript || [])];

      if (state.phase === "completed") {
        const teacherMessage = makeTeacherMessage(GROUP_C_DONE_MESSAGE);
        await storage.updateFeedback(feedback.id, {
          dialogueTranscript: [...transcript, teacherMessage] as any,
          summary: JSON.stringify(state),
        });
        return res.json({ message: teacherMessage, done: true });
      }

      const { nextState, teacherMessage, done } = buildAdvanceResult(state);

      await storage.updateFeedback(feedback.id, {
        dialogueTranscript: [...transcript, teacherMessage] as any,
        summary: JSON.stringify(nextState),
      });

      res.json({
        message: teacherMessage,
        done,
        stage: nextState.current_stage,
        currentIndex: nextState.current_index,
        total: nextState.current_stage === "preserves"
          ? nextState.feedback_json.preserve_points.length
          : nextState.feedback_json.improvement_points.length,
      });
    } catch (error) {
      console.error("Failed to advance feedback dialogue:", error);
      res.status(500).json({ message: "Failed to advance feedback dialogue" });
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

      const state = parseGroupCState(feedback.summary, feedback);
      const updatedTranscript = [...(feedback.dialogueTranscript || []), message];

      const normalizedState: GroupCState = state.phase === "completed" ? state : { ...state, phase: "discussing_point" };

      if (normalizedState.phase === "completed") {
        const teacherMessage = makeTeacherMessage(GROUP_C_DONE_MESSAGE);
        await storage.updateFeedback(feedback.id, {
          dialogueTranscript: [...updatedTranscript, teacherMessage] as any,
          summary: JSON.stringify(normalizedState),
        });
        return res.json({ response: teacherMessage, done: true });
      }

      const originalConversation = (conversation.transcript || [])
        .map((msg) => `${msg.role === "student" ? "Student" : "Layperson"}: ${msg.content}`)
        .join("\n");

      const currentPoint = normalizedState.current_stage === "preserves"
        ? normalizedState.feedback_json.preserve_points[normalizedState.current_index] || ""
        : normalizedState.feedback_json.improvement_points[normalizedState.current_index] || "";
      const currentLabel = normalizedState.current_stage === "preserves" ? "strength to preserve" : "area for improvement";
      const systemPrompt = `You are an insightful, friendly science communication coach.

    You are having an ongoing conversation about ONE specific ${currentLabel}.
    Your job:
    - Respond naturally to what the student just wrote (questions, disagreement, uncertainty, examples).
    - Stay focused on the current point only; do not introduce new feedback points.
    - Do NOT ask the student to reply with strict formats like "yes/no".
    - If the student asks to move on, tell them they can use the "Present next feedback comment" button.
    - Keep replies concise, supportive, and practical (1–2 short paragraphs, plus at most 1 question).

    Current feedback point:
    ${currentPoint}

    Original conversation transcript (for grounding quotes/context):
    ${originalConversation || "No transcript available."}`;

      const transcriptForLLM = updatedTranscript.slice(-20).map((msg) => {
        const role = msg.role === "teacher" ? "assistant" : "user";

        if (msg.role === "teacher") {
          const extracted = tryExtractFeedbackPointForLLM(msg.content);
          if (extracted) {
            return {
              role,
              content: `${extracted.prefix}\n\nFeedback point:\n${extracted.point}`.trim(),
            };
          }
        }

        return { role, content: msg.content };
      });

      const messagesForLLM = [{ role: "system", content: systemPrompt }, ...transcriptForLLM] as any;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: messagesForLLM,
        temperature: 0.7,
      });

      const teacherResponse =
        completion.choices[0]?.message?.content || "Could you tell me more about your thoughts on that?";

      const teacherMessage = makeTeacherMessage(teacherResponse);

      await storage.updateFeedback(feedback.id, {
        dialogueTranscript: [...updatedTranscript, teacherMessage] as any,
        summary: JSON.stringify(normalizedState),
      });

      res.json({ response: teacherMessage, done: false });
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
