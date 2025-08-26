import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import type { Feedback } from "@shared/schema";

interface FeedbackChartsProps {
  feedback: Feedback;
}

function getScoreColor(score: number): string {
  if (score >= 80) return "bg-green-500";
  if (score >= 60) return "bg-yellow-500";
  return "bg-red-500";
}

function getScoreBadgeVariant(score: number): "default" | "secondary" | "destructive" {
  if (score >= 80) return "default";
  if (score >= 60) return "secondary";
  return "destructive";
}

function getScoreLabel(score: number): string {
  if (score >= 90) return "Excellent";
  if (score >= 80) return "Good";
  if (score >= 60) return "Needs Work";
  return "Poor";
}

export default function FeedbackCharts({ feedback }: FeedbackChartsProps) {
  const overallScore = Number(feedback.overallScore);
  const clarity = Number(feedback.clarityScore);
  const questionHandling = Number(feedback.questionHandlingScore);
  const engagement = Number(feedback.engagementScore);
  const pacing = Number(feedback.pacingScore);

  const categories = [
    {
      name: "Clarity & Simplicity",
      score: clarity,
      description: "How well you explained complex concepts in simple terms"
    },
    {
      name: "Question Handling",
      score: questionHandling,
      description: "How effectively you addressed questions and concerns"
    },
    {
      name: "Engagement & Empathy",
      score: engagement,
      description: "How well you connected with your audience"
    },
    {
      name: "Pacing & Structure",
      score: pacing,
      description: "How well-organized and appropriately paced your explanation was"
    }
  ];

  return (
    <div className="space-y-8">
      {/* Overall Score */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-slate-800">Overall Communication Score</h3>
          <div className="flex justify-center">
            <div className="relative w-32 h-32">
              <svg className="transform -rotate-90 w-32 h-32">
                <circle 
                  cx="64" 
                  cy="64" 
                  r="56" 
                  stroke="#E2E8F0" 
                  strokeWidth="8" 
                  fill="transparent"
                />
                <circle 
                  cx="64" 
                  cy="64" 
                  r="56" 
                  stroke="#10B981" 
                  strokeWidth="8" 
                  fill="transparent" 
                  strokeDasharray="351.86" 
                  strokeDashoffset={351.86 - (351.86 * overallScore / 100)}
                  strokeLinecap="round"
                  className="transition-all duration-1000"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-3xl font-bold text-slate-800" data-testid="overall-score">
                  {Math.round(overallScore)}%
                </span>
              </div>
            </div>
          </div>
          <p className="text-slate-600">
            {getScoreLabel(overallScore)} - {
              overallScore >= 80 
                ? "You're effectively communicating complex concepts!" 
                : overallScore >= 60
                ? "Good foundation, keep practicing to improve further."
                : "Focus on the recommendations below to enhance your communication."
            }
          </p>
        </div>
      </div>

      {/* Category Scores */}
      <div className="grid md:grid-cols-2 gap-6">
        {categories.map((category, index) => (
          <div key={index} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-lg font-semibold text-slate-800">
                  {category.name}
                </h4>
                <Badge variant={getScoreBadgeVariant(category.score)} data-testid={`score-badge-${index}`}>
                  {getScoreLabel(category.score)}
                </Badge>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Score</span>
                  <span className="font-medium text-slate-800" data-testid={`score-value-${index}`}>
                    {Math.round(category.score)}/100
                  </span>
                </div>
                <Progress 
                  value={category.score} 
                  className="h-2"
                  data-testid={`progress-${index}`}
                />
              </div>
              
              <p className="text-sm text-slate-600">
                {category.description}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Recommendations */}
      {feedback.recommendations && feedback.recommendations.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center">
            <svg className="w-5 h-5 text-blue-500 mr-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            Key Recommendations for Next Conversation
          </h3>
          <ul className="space-y-2">
            {feedback.recommendations.map((recommendation, index) => (
              <li key={index} className="flex items-start space-x-3" data-testid={`recommendation-${index}`}>
                <svg className="w-4 h-4 text-blue-500 mt-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
                <p className="text-slate-700 text-sm">{recommendation}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Detailed Feedback */}
      {feedback.detailedFeedback && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-3">Detailed Analysis</h3>
          <p className="text-slate-700 text-sm leading-relaxed" data-testid="detailed-feedback">
            {feedback.detailedFeedback}
          </p>
        </div>
      )}
    </div>
  );
}
