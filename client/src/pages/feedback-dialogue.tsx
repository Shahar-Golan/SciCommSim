import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ArrowRight, Bot, MessageSquare, Send, Sparkles, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { FeedbackMessage } from "@shared/schema";

interface FeedbackDialogueProps {
  conversationId: string;
  conversationNumber: number;
  onComplete: () => void;
}

type InitialDialogueResponse = {
  message: FeedbackMessage;
  feedbackId: string;
};

type TeacherResponsePayload = {
  response: FeedbackMessage;
};

export default function FeedbackDialogue({
  conversationId,
  conversationNumber,
  onComplete,
}: FeedbackDialogueProps) {
  const [messages, setMessages] = useState<FeedbackMessage[]>([]);
  const [feedbackId, setFeedbackId] = useState<string>("");
  const [isProcessingTeacher, setIsProcessingTeacher] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [isPreparingFeedback, setIsPreparingFeedback] = useState(true);
  const [feedbackReady, setFeedbackReady] = useState(false);
  const [firstMessage, setFirstMessage] = useState<FeedbackMessage | null>(null);
  const [draftMessage, setDraftMessage] = useState("");
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    prepareFeedbackDialogue();
  }, []);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTo({
        top: chatScrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, isProcessingTeacher]);

  const latestTeacherMessage = useMemo(() => {
    return [...messages].reverse().find((message) => message.role === "teacher");
  }, [messages]);

  const prepareFeedbackDialogue = async () => {
    try {
      setIsPreparingFeedback(true);

      const feedbackResponse = await apiRequest("POST", "/api/feedback", {
        conversationId,
      });

      const feedbackData = await feedbackResponse.json();

      const dialogueResponse = await apiRequest("POST", "/api/feedback-dialogue/start", {
        conversationId,
        feedbackId: feedbackData.id,
      });

      const result = (await dialogueResponse.json()) as InitialDialogueResponse;
      setFeedbackId(result.feedbackId);
      setFirstMessage(result.message);
      setIsPreparingFeedback(false);
      setFeedbackReady(true);
    } catch (error) {
      console.error("Failed to prepare feedback dialogue:", error);
      setIsPreparingFeedback(false);
      toast({
        title: "Error",
        description: "Failed to prepare feedback dialogue. Please try again.",
        variant: "destructive",
      });
    }
  };

  const startFeedbackDialogue = async () => {
    if (!firstMessage) return;

    setMessages([firstMessage]);
    setHasStarted(true);
    setFeedbackReady(false);

    requestAnimationFrame(() => composerRef.current?.focus());
  };

  const addMessage = (role: "student" | "teacher", content: string) => {
    const newMessage: FeedbackMessage = {
      role,
      content,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, newMessage]);
    return newMessage;
  };

  const handleStudentResponse = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isProcessingTeacher) return;

    const studentMessage = addMessage("student", trimmed);
    setIsProcessingTeacher(true);

    try {
      const response = await apiRequest("POST", "/api/feedback-dialogue/respond", {
        conversationId,
        feedbackId,
        message: studentMessage,
      });

      const result = (await response.json()) as TeacherResponsePayload;
      addMessage("teacher", result.response.content);
    } catch (error) {
      console.error("Failed to get teacher response:", error);
      toast({
        title: "Error",
        description: "Failed to get response. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessingTeacher(false);
      requestAnimationFrame(() => composerRef.current?.focus());
    }
  };

  const handleSubmit = async () => {
    const draft = draftMessage.trim();
    if (!draft || isProcessingTeacher) return;

    setDraftMessage("");
    await handleStudentResponse(draft);
  };

  const handleComplete = async () => {
    try {
      await apiRequest("POST", "/api/feedback-dialogue/complete", {
        conversationId,
        feedbackId,
      });
      onComplete();
    } catch (error) {
      console.error("Failed to complete dialogue:", error);
      toast({
        title: "Error",
        description: "Failed to complete dialogue. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSubmit();
    }
  };

  if (isPreparingFeedback) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-slate-600">Preparing your text feedback...</p>
        </div>
      </div>
    );
  }

  if (feedbackReady && !hasStarted) {
    return (
      <div className="flex items-center justify-center min-h-96 px-4">
        <Card className="max-w-2xl w-full border-slate-200 shadow-lg">
          <CardContent className="pt-8 pb-8">
            <div className="text-center space-y-6">
              <div className="mx-auto w-20 h-20 bg-gradient-to-br from-purple-100 to-blue-100 rounded-full flex items-center justify-center">
                <MessageSquare className="w-10 h-10 text-purple-600" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-slate-800">
                  Feedback Ready - Conversation {conversationNumber}
                </h2>
                <p className="text-slate-600 leading-relaxed">
                  Your coach feedback has been prepared. When you start, the dialogue will continue as a text conversation with chat bubbles instead of voice.
                </p>
              </div>
              <Button
                onClick={startFeedbackDialogue}
                size="lg"
                className="bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
              >
                <Sparkles className="mr-2 w-5 h-5" />
                Start Feedback Dialogue
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="bg-gradient-to-br from-purple-50 to-blue-50 border-purple-200 shadow-sm">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-purple-100 rounded-lg shrink-0">
              <MessageSquare className="w-6 h-6 text-purple-600" />
            </div>
            <div className="flex-1 space-y-2">
              <h2 className="text-2xl font-bold text-slate-800">
                Text Feedback Dialogue - Conversation {conversationNumber}
              </h2>
              <p className="text-slate-600 leading-relaxed">
                Read the coach feedback, respond in text, and keep the dialogue focused on how the conversation was communicated.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm border-slate-200">
        <CardContent className="pt-6 space-y-6">
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-lg font-semibold text-slate-700 flex items-center gap-2">
              <Bot className="w-5 h-5 text-blue-600" />
              Coach Chat
            </h3>
            <div className="text-sm text-slate-500">
              {messages.length} message{messages.length === 1 ? "" : "s"}
            </div>
          </div>

          <div ref={chatScrollRef} className="h-[32rem] overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
            <div className="space-y-4 pr-2">
              {messages.length === 0 ? (
                <div className="flex h-80 items-center justify-center text-center text-slate-500">
                  <div>
                    <MessageSquare className="mx-auto mb-3 w-10 h-10 text-slate-300" />
                    <p>The coach message will appear here when the dialogue starts.</p>
                  </div>
                </div>
              ) : (
                messages.map((message, index) => {
                  const isStudent = message.role === "student";
                  return (
                    <div
                      key={`${message.timestamp}-${index}`}
                      className={`flex ${isStudent ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${
                          isStudent
                            ? "bg-gradient-to-r from-blue-500 to-cyan-500 text-white"
                            : "bg-white text-slate-800 border border-slate-200"
                        }`}
                      >
                        <div className={`mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide ${isStudent ? "text-white/90" : "text-slate-500"}`}>
                          {isStudent ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                          <span>{isStudent ? "You" : "Coach"}</span>
                        </div>
                        <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                        <div className={`mt-3 text-[11px] ${isStudent ? "text-white/70" : "text-slate-400"}`}>
                          {new Date(message.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}

              {isProcessingTeacher && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <Bot className="w-3.5 h-3.5" />
                      <span>Coach</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-500">
                      <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-blue-500" />
                      <span className="text-sm">Typing a response...</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700" htmlFor="feedback-composer">
                Your reply
              </label>
              <Textarea
                id="feedback-composer"
                ref={composerRef}
                value={draftMessage}
                onChange={(event) => setDraftMessage(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder="Type your response here. Press Enter to send, or Shift+Enter for a new line."
                className="min-h-[120px] resize-none"
                disabled={isProcessingTeacher}
              />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-500">
                Keep the conversation focused on how you explained the science, not on the science itself.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  onClick={() => setDraftMessage("")}
                  disabled={isProcessingTeacher || !draftMessage.trim()}
                >
                  Clear
                </Button>
                <Button
                  onClick={() => void handleSubmit()}
                  disabled={isProcessingTeacher || !draftMessage.trim()}
                  className="bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
                >
                  <Send className="mr-2 w-4 h-4" />
                  Send Reply
                </Button>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={() => void handleComplete()}
              disabled={isProcessingTeacher}
              className="bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
            >
              Complete Feedback <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {latestTeacherMessage && (
        <p className="text-center text-sm text-slate-500">
          Latest coach reply is shown in the chat above.
        </p>
      )}
    </div>
  );
}
