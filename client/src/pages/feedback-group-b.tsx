import { ArrowLeft, RotateCcw, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Feedback } from "@shared/schema";

interface FeedbackGroupBProps {
  feedback: Feedback;
  conversationNumber: number;
  onNext: () => void;
  onBack?: () => void;
}

function renderTextWithHighlightedQuotes(text: string) {
  const nodes: Array<JSX.Element | string> = [];
  const quoteRegex = /"([^"]+)"/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = quoteRegex.exec(text)) !== null) {
    const matchIndex = match.index;
    const fullMatch = match[0] || "";
    const quoteText = match[1] || "";

    if (matchIndex > lastIndex) {
      nodes.push(text.slice(lastIndex, matchIndex));
    }

    nodes.push(
      <span
        key={`quote-${matchIndex}`}
        className="inline-flex max-w-full items-baseline rounded-md border border-slate-300 bg-white/80 px-1.5 py-0.5 align-baseline italic"
      >
        <span className="break-words">“{quoteText}”</span>
      </span>,
    );

    lastIndex = matchIndex + fullMatch.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

export default function FeedbackGroupB({ feedback, conversationNumber, onNext, onBack }: FeedbackGroupBProps) {
  return (
    <div className="space-y-8">
      {onBack && (
        <div>
          <Button type="button" variant="outline" onClick={onBack}>
            <ArrowLeft className="mr-2 w-4 h-4" />
            Back to Test Feedback
          </Button>
        </div>
      )}

      <div className="text-center space-y-4">
        <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto">
          <TrendingUp className="text-white text-2xl w-8 h-8" />
        </div>
        <h2 className="text-3xl font-bold text-slate-800">Feedback</h2>
        <p className="text-lg text-slate-600">
          {conversationNumber === 1 ? "First" : "Second"} conversation completed.
        </p>
      </div>

      <div className="max-w-4xl mx-auto space-y-6">
        {feedback.strengths && (
          <div className="bg-green-50 rounded-xl shadow-sm border border-green-200 p-8">
            <h3 className="text-xl font-semibold text-green-800 mb-4 flex items-center">
              <div className="w-3 h-3 bg-green-500 rounded-full mr-3" />
              What You Did Well
            </h3>
            <p className="text-green-700 leading-relaxed whitespace-pre-wrap">{renderTextWithHighlightedQuotes(feedback.strengths)}</p>
          </div>
        )}

        {feedback.improvements && (
          <div className="bg-blue-50 rounded-xl shadow-sm border border-blue-200 p-8">
            <h3 className="text-xl font-semibold text-blue-800 mb-4 flex items-center">
              <div className="w-3 h-3 bg-blue-500 rounded-full mr-3" />
              Points for Improvement
            </h3>
            <p className="text-blue-700 leading-relaxed whitespace-pre-wrap">{renderTextWithHighlightedQuotes(feedback.improvements)}</p>
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
