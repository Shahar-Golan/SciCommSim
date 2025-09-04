import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { TrendingUp, RotateCcw } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Feedback, Message } from "@shared/schema";

interface FeedbackProps {
  conversationId: string;
  conversationNumber: number;
  onNext: () => void;
}

export default function FeedbackPage({ conversationId, conversationNumber, onNext }: FeedbackProps) {
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    generateFeedback();
  }, [conversationId]);

  const generateFeedback = async () => {
    console.log("generateFeedback called with conversationId:", conversationId);
    setIsLoading(true);
    try {
      // First, get the conversation to extract messages
      console.log("Fetching conversation...");
      const conversationResponse = await fetch(`/api/conversations/${conversationId}`, {
        credentials: "include",
      });
      
      console.log("Conversation response status:", conversationResponse.status);
      
      if (!conversationResponse.ok) {
        const errorText = await conversationResponse.text();
        console.error("Conversation fetch error:", errorText);
        throw new Error("Failed to fetch conversation");
      }
      
      const conversation = await conversationResponse.json();
      console.log("Got conversation:", conversation);
      
      // Generate feedback based on conversation messages
      console.log("About to call feedback API with:", {
        conversationId,
        messages: conversation.transcript || [],
      });
      
      // Use raw fetch instead of apiRequest to handle errors manually
      const feedbackResponse = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          conversationId,
          messages: conversation.transcript || [],
        }),
        credentials: "include",
      });
      
      console.log("Feedback response status:", feedbackResponse.status, feedbackResponse.statusText);
      
      if (!feedbackResponse.ok) {
        const errorText = await feedbackResponse.text();
        console.error("Feedback API error:", errorText);
        throw new Error("Failed to generate feedback");
      }
      
      const feedbackData = await feedbackResponse.json();
      setFeedback(feedbackData);
    } catch (error) {
      console.error("Failed to generate feedback:", error);
      toast({
        title: "Feedback Error",
        description: "Failed to generate feedback. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-slate-600">Analyzing your conversation...</p>
        </div>
      </div>
    );
  }

  if (!feedback) {
    return (
      <div className="text-center space-y-4">
        <p className="text-slate-600">Failed to generate feedback.</p>
        <Button onClick={generateFeedback} variant="outline">
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto">
          <TrendingUp className="text-white text-2xl w-8 h-8" />
        </div>
        <h2 className="text-3xl font-bold text-slate-800">Your Performance Feedback</h2>
        <p className="text-lg text-slate-600">
          {conversationNumber === 1 ? "First" : "Second"} conversation completed! Here's how you did:
        </p>
      </div>

      <div className="max-w-4xl mx-auto space-y-6">
        {/* Strengths */}
        {feedback.strengths && (
          <div className="bg-green-50 rounded-xl shadow-sm border border-green-200 p-8">
            <h3 className="text-xl font-semibold text-green-800 mb-4 flex items-center">
              <div className="w-3 h-3 bg-green-500 rounded-full mr-3"></div>
              What You Did Well
            </h3>
            <p className="text-green-700 leading-relaxed">{feedback.strengths}</p>
          </div>
        )}

        {/* Points for Improvement */}
        {feedback.improvements && (
          <div className="bg-blue-50 rounded-xl shadow-sm border border-blue-200 p-8">
            <h3 className="text-xl font-semibold text-blue-800 mb-4 flex items-center">
              <div className="w-3 h-3 bg-blue-500 rounded-full mr-3"></div>
              Points for Improvement
            </h3>
            <p className="text-blue-700 leading-relaxed">{feedback.improvements}</p>
          </div>
        )}

      </div>

      <div className="text-center">
        <Button 
          onClick={onNext}
          className="bg-blue-500 hover:bg-blue-600 py-4 px-8 text-lg font-semibold"
          data-testid={conversationNumber === 1 ? "button-start-second-conversation" : "button-continue-to-survey"}
        >
          {conversationNumber === 1 ? (
            <>
              <RotateCcw className="mr-3 w-5 h-5" />
              <span>START SECOND CONVERSATION</span>
            </>
          ) : (
            <>
              <span>Continue to Survey</span>
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
