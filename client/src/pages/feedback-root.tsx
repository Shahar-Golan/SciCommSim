import { useState } from "react";
import { MessageSquare, Quote, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Feedback } from "@shared/schema";
import FeedbackDialogue from "./feedback-group-c";
import FeedbackGroupA from "./feedback-group-a";
import FeedbackGroupB from "./feedback-group-b";

type FeedbackGroup = "A" | "B" | "C";

interface FeedbackRootProps {
  conversationId: string;
  conversationNumber: number;
  onComplete: () => void;
}

const GROUP_OPTIONS: Array<{ group: FeedbackGroup; title: string; description: string; icon: "sparkles" | "quote" | "chat" }> = [
  {
    group: "A",
    title: "Group A",
    description: "Brief non-dialogue feedback, no transcript references.",
    icon: "sparkles",
  },
  {
    group: "B",
    title: "Group B",
    description: "Non-dialogue feedback with transcript-based references.",
    icon: "quote",
  },
  {
    group: "C",
    title: "Group C",
    description: "Interactive text dialogue (ping-pong chat) with coach.",
    icon: "chat",
  },
];

export default function FeedbackRoot({ conversationId, conversationNumber, onComplete }: FeedbackRootProps) {
  const [selectedGroup, setSelectedGroup] = useState<FeedbackGroup | null>(null);
  const [startedGroup, setStartedGroup] = useState<FeedbackGroup | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [feedbackData, setFeedbackData] = useState<Feedback | null>(null);
  const { toast } = useToast();

  const startFeedback = async () => {
    if (!selectedGroup) return;

    if (selectedGroup === "C") {
      setStartedGroup("C");
      return;
    }

    setIsStarting(true);
    try {
      const response = await apiRequest("POST", "/api/feedback", {
        conversationId,
        feedbackGroup: selectedGroup,
      });

      const result = (await response.json()) as Feedback;
      setFeedbackData(result);
      setStartedGroup(selectedGroup);
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

  return (
    <div className="space-y-6">
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="pt-8 pb-8 space-y-4 text-center">
          <h2 className="text-2xl font-bold text-slate-800">Choose Your Feedback Format</h2>
          <p className="text-slate-600 max-w-2xl mx-auto">
            Select Group A, B, or C before starting feedback. Each group uses a different mechanism and prompt style.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {GROUP_OPTIONS.map((option) => {
          const isSelected = selectedGroup === option.group;
          return (
            <button
              key={option.group}
              type="button"
              onClick={() => setSelectedGroup(option.group)}
              className={`rounded-xl border p-5 text-left transition-colors ${
                isSelected
                  ? "border-blue-500 bg-blue-50"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <div className="mb-3 text-blue-600">
                {option.icon === "sparkles" && <Sparkles className="w-5 h-5" />}
                {option.icon === "quote" && <Quote className="w-5 h-5" />}
                {option.icon === "chat" && <MessageSquare className="w-5 h-5" />}
              </div>
              <h3 className="text-lg font-semibold text-slate-800">{option.title}</h3>
              <p className="text-sm text-slate-600 mt-2">{option.description}</p>
            </button>
          );
        })}
      </div>

      <div className="text-center">
        <Button
          onClick={() => void startFeedback()}
          disabled={!selectedGroup || isStarting}
          className="bg-blue-600 hover:bg-blue-700 px-8 py-4 text-base"
          data-testid="button-start-selected-feedback"
        >
          {isStarting ? "Preparing feedback..." : "Start Feedback"}
        </Button>
      </div>
    </div>
  );
}
