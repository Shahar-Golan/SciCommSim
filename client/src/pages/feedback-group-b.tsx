import { RotateCcw, Quote, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Feedback } from "@shared/schema";

interface FeedbackGroupBProps {
  feedback: Feedback;
  conversationNumber: number;
  onNext: () => void;
}

function extractReferences(feedback: Feedback): string[] {
  const quoteRegex = /"([^"]+)"/g;
  const text = `${feedback.strengths || ""}\n${feedback.improvements || ""}`;
  const quotes: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = quoteRegex.exec(text)) !== null) {
    const value = match[1]?.trim();
    if (value) {
      quotes.push(value);
    }
  }

  return Array.from(new Set(quotes));
}

export default function FeedbackGroupB({ feedback, conversationNumber, onNext }: FeedbackGroupBProps) {
  const references = extractReferences(feedback);

  return (
    <div className="space-y-8">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto">
          <TrendingUp className="text-white text-2xl w-8 h-8" />
        </div>
        <h2 className="text-3xl font-bold text-slate-800">Your Performance Feedback</h2>
        <p className="text-lg text-slate-600">
          {conversationNumber === 1 ? "First" : "Second"} conversation completed, with transcript-based references.
        </p>
      </div>

      <div className="max-w-4xl mx-auto space-y-6">
        {feedback.strengths && (
          <div className="bg-green-50 rounded-xl shadow-sm border border-green-200 p-8">
            <h3 className="text-xl font-semibold text-green-800 mb-4 flex items-center">
              <div className="w-3 h-3 bg-green-500 rounded-full mr-3" />
              What You Did Well
            </h3>
            <p className="text-green-700 leading-relaxed whitespace-pre-wrap">{feedback.strengths}</p>
          </div>
        )}

        {feedback.improvements && (
          <div className="bg-blue-50 rounded-xl shadow-sm border border-blue-200 p-8">
            <h3 className="text-xl font-semibold text-blue-800 mb-4 flex items-center">
              <div className="w-3 h-3 bg-blue-500 rounded-full mr-3" />
              Points for Improvement
            </h3>
            <p className="text-blue-700 leading-relaxed whitespace-pre-wrap">{feedback.improvements}</p>
          </div>
        )}

        {references.length > 0 && (
          <div className="bg-slate-50 rounded-xl shadow-sm border border-slate-200 p-8 space-y-4">
            <h3 className="text-xl font-semibold text-slate-800 flex items-center">
              <Quote className="mr-2 w-5 h-5 text-slate-600" />
              References from Your Conversation
            </h3>
            <div className="space-y-3">
              {references.map((quoteText, index) => (
                <div key={`${quoteText}-${index}`} className="rounded-lg border border-slate-300 bg-white px-4 py-3">
                  <p className="text-slate-700 italic">“{quoteText}”</p>
                </div>
              ))}
            </div>
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
            <span>Continue to Survey</span>
          )}
        </Button>
      </div>
    </div>
  );
}
