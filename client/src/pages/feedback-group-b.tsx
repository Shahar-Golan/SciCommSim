import { ArrowLeft, RotateCcw, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Feedback } from "@shared/schema";

interface FeedbackGroupBProps {
  feedback: Feedback;
  conversationNumber: number;
  onNext: () => void;
  onBack?: () => void;
}

function isWordChar(char: string | undefined) {
  return !!char && /[A-Za-z0-9]/.test(char);
}

function shouldRestartQuote(buffer: string, nextChar: string | undefined) {
  const trimmedBuffer = buffer.trim();
  if (trimmedBuffer.length < 8 || !isWordChar(nextChar)) {
    return false;
  }

  return /[:;,]\s*$/.test(trimmedBuffer);
}

function renderTextWithHighlightedQuotes(text: string) {
  const normalizedText = text
    // Repair malformed contractions caused by mismatched smart quotes, e.g. I “m -> I'm
    .replace(/\b([A-Za-z]+)\s*["\u201c\u201d\u2018\u2019']\s*(m|re|ve|ll|d|s|t)\b/gi, "$1'$2")
    .replace(/\s+/g, " ")
    .trim();

  const nodes: Array<JSX.Element | string> = [];
  const quoteChars = new Set(['"', "'", "\u201c", "\u201d", "\u2018", "\u2019"]);
  let plainBuffer = "";
  let quoteBuffer = "";
  let inQuote = false;

  for (let index = 0; index < normalizedText.length; index += 1) {
    const char = normalizedText[index];
    const previousChar = normalizedText[index - 1];
    const nextChar = normalizedText[index + 1];
    const isQuoteDelimiter = quoteChars.has(char);
    const isApostropheInsideWord = (char === "'" || char === "\u2019") && isWordChar(previousChar) && isWordChar(nextChar);

    if (!isQuoteDelimiter || isApostropheInsideWord) {
      if (inQuote) {
        quoteBuffer += char;
      } else {
        plainBuffer += char;
      }
      continue;
    }

    if (!inQuote) {
      if (plainBuffer) {
        nodes.push(plainBuffer);
        plainBuffer = "";
      }
      inQuote = true;
      quoteBuffer = "";
      continue;
    }

    if (shouldRestartQuote(quoteBuffer, nextChar)) {
      plainBuffer += quoteBuffer;
      quoteBuffer = "";
      continue;
    }

    const trimmedQuote = quoteBuffer.trim();
    if (trimmedQuote.length >= 2) {
      nodes.push(
        <span
          key={`quote-${index}`}
          className="inline-flex max-w-full items-baseline rounded-md border border-slate-300 bg-white/80 px-1.5 py-0.5 align-baseline italic"
        >
          <span className="break-words">“{trimmedQuote}”</span>
        </span>,
      );
    } else {
      plainBuffer += quoteBuffer;
    }

    quoteBuffer = "";
    inQuote = false;
  }

  if (quoteBuffer) {
    plainBuffer += quoteBuffer;
  }

  if (plainBuffer) {
    nodes.push(plainBuffer);
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
