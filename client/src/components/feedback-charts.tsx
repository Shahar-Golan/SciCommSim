import type { Feedback } from "@shared/schema";

interface FeedbackChartsProps {
  feedback: Feedback;
}

export default function FeedbackCharts({ feedback }: FeedbackChartsProps) {
  return (
    <div className="space-y-6">
      {feedback.summary && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-3">Summary</h3>
          <p className="text-slate-700 text-sm leading-relaxed" data-testid="feedback-summary">
            {feedback.summary}
          </p>
        </div>
      )}

      {feedback.strengths && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-green-800 mb-3">What You Did Well</h3>
          <p className="text-green-700 text-sm leading-relaxed" data-testid="feedback-strengths">
            {feedback.strengths}
          </p>
        </div>
      )}

      {feedback.improvements && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-blue-800 mb-3">Points for Improvement</h3>
          <p className="text-blue-700 text-sm leading-relaxed" data-testid="feedback-improvements">
            {feedback.improvements}
          </p>
        </div>
      )}

      {!feedback.summary && !feedback.strengths && !feedback.improvements && (
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <p className="text-slate-600 text-sm" data-testid="feedback-empty-state">
            No feedback content available yet.
          </p>
        </div>
      )}
    </div>
  );
}
