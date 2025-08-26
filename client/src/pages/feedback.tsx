import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { TrendingUp, RotateCcw } from "lucide-react";
import FeedbackCharts from "@/components/feedback-charts";
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
      const conversationResponse = await fetch(`http://localhost:5000/api/conversations/${conversationId}`, {
        credentials: "include",
      });
      
      console.log("Conversation response status:", conversationResponse.status);
      
      if (!conversationResponse.ok) {
        const errorText = await conversationResponse.text();
        console.error("Conversation fetch error:", errorText);
        throw new Error("Failed to fetch conversation");
      }
      
      // Debug: check what we're actually getting
      const responseText = await conversationResponse.text();
      console.log("Raw response text:", responseText.substring(0, 200));
      
      let conversation;
      try {
        conversation = JSON.parse(responseText);
      } catch (parseError) {
        console.error("JSON parse error:", parseError);
        console.error("Response was:", responseText);
        throw new Error("Invalid JSON response from conversation API");
      }
      console.log("Got conversation:", conversation);
      
      // Generate feedback based on conversation messages
      console.log("About to call feedback API with:", {
        conversationId,
        messages: conversation.transcript || [],
      });
      
      // Use raw fetch instead of apiRequest to handle errors manually
      const feedbackResponse = await fetch("http://localhost:5000/api/feedback", {
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

      <FeedbackCharts feedback={feedback} />

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
