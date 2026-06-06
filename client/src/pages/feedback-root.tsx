import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Feedback } from "@shared/schema";
import FeedbackDialogue from "./feedback-group-c";
import FeedbackGroupA from "./feedback-group-a";
import FeedbackGroupB from "./feedback-group-b";

interface FeedbackRootProps {
  conversationId: string;
  conversationNumber: number;
  onComplete: () => void;
}

export default function FeedbackRoot({ conversationId, conversationNumber, onComplete }: FeedbackRootProps) {
  const [startedGroup, setStartedGroup] = useState<"A" | "B" | "C" | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [feedbackData, setFeedbackData] = useState<Feedback | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const startFeedback = async () => {
      if (startedGroup || feedbackData || isStarting) {
        return;
      }

      setIsStarting(true);
      try {
        const response = await apiRequest("POST", "/api/feedback", {
          conversationId,
        });

        const result = (await response.json()) as Feedback;
        const feedbackGroup = result.group === "A" || result.group === "B" || result.group === "C" ? result.group : "C";
        setFeedbackData(result);
        setStartedGroup(feedbackGroup);
      } catch (error) {
        console.error("Failed to prepare feedback:", error);
        toast({
          title: "Error",
          description: "Failed to prepare feedback. Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsStarting(false);
      }
    };

    void startFeedback();
  }, [conversationId, feedbackData, isStarting, startedGroup, toast]);

  if (!startedGroup || !feedbackData) {
    return (
      <div className="space-y-6 text-center">
        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="text-2xl font-bold text-slate-800">Preparing your feedback</h2>
          <p className="mt-2 text-slate-600">
            The system is assigning your feedback format and generating the first response.
          </p>
          {isStarting && <p className="mt-4 text-sm text-slate-500">This might take up to 30 seconds.</p>}
        </div>
      </div>
    );
  }

  if (startedGroup === "A" && feedbackData) {
    return <FeedbackGroupA feedback={feedbackData} conversationNumber={conversationNumber} onNext={onComplete} />;
  }

  if (startedGroup === "B" && feedbackData) {
    return <FeedbackGroupB feedback={feedbackData} conversationNumber={conversationNumber} onNext={onComplete} />;
  }

  if (startedGroup === "C") {
    return (
      <FeedbackDialogue
        conversationId={conversationId}
        conversationNumber={conversationNumber}
        feedbackGroup="C"
        onComplete={onComplete}
      />
    );
  }

  return null;
}
