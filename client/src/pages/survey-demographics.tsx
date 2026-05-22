import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { BarChart3, Check } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  buildSurveyTextResponse,
  findFirstMissingRequiredAnswer,
  optionNeedsFreeText,
  SURVEY_SECTIONS_ALL,
  SURVEY_TITLE,
} from "@/pages/survey-shared";

interface SurveyDemographicsProps {
  sessionId: string;
  responses: Record<string, string>;
  setResponse: (id: string, value: string) => void;
  onComplete: () => void;
}

export default function SurveyDemographics({ sessionId, responses, setResponse, onComplete }: SurveyDemographicsProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const section = SURVEY_SECTIONS_ALL.find((s) => s.title === "Demographics")!;
  const allSections = useMemo(() => SURVEY_SECTIONS_ALL, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const missingId = findFirstMissingRequiredAnswer(allSections, responses);
    if (missingId) {
      toast({
        title: "Incomplete Survey",
        description: "Please answer all required questions before submitting.",
        variant: "destructive",
      });
      return;
    }

    const helpfulnessRating = parseInt(responses.helpfulness || "", 10);
    if (!Number.isFinite(helpfulnessRating)) {
      toast({
        title: "Rating Required",
        description: "Please select a helpfulness rating before submitting.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await apiRequest("PATCH", `/api/training-sessions/${sessionId}`, {
        helpfulnessRating,
        experienceFeedback: buildSurveyTextResponse(SURVEY_SECTIONS_ALL, responses) || null,
      });

      onComplete();
    } catch (error) {
      console.error("Failed to submit survey:", error);
      toast({
        title: "Submission Error",
        description: "Failed to submit survey. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 bg-yellow-500 rounded-full flex items-center justify-center mx-auto">
          <BarChart3 className="text-white text-2xl w-8 h-8" />
        </div>
        <h2 className="text-3xl font-bold text-slate-800">{SURVEY_TITLE}</h2>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto">Please complete the survey below.</p>
      </div>

      <Card className="max-w-2xl mx-auto">
        <CardContent className="p-8">
          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="space-y-6">
              <div className="space-y-1">
                {section.instructions && <p className="text-sm text-slate-600">{section.instructions}</p>}
              </div>

              <div className="space-y-8">
                {section.questions.map((q) => {
                  if (q.type === "number") {
                    return (
                      <div key={q.id} className="space-y-3">
                        <p className="font-medium text-slate-800">{q.text}</p>
                        <Input
                          type="number"
                          min={0}
                          value={responses[q.id] ?? ""}
                          onChange={(e) => setResponse(q.id, e.target.value)}
                          placeholder={q.placeholder}
                          data-testid={`survey-${q.id}`}
                        />
                      </div>
                    );
                  }

                  if (q.type === "single_choice") {
                    const selected = responses[q.id] ?? "";
                    const needsFree = selected ? optionNeedsFreeText(selected, q.freeTextOptionPrefixes) : false;

                    return (
                      <div key={q.id} className="space-y-3">
                        <p className="font-medium text-slate-800">{q.text}</p>
                        <RadioGroup
                          value={selected}
                          onValueChange={(val) => setResponse(q.id, val)}
                          className="space-y-2"
                          data-testid={`survey-${q.id}`}
                        >
                          {q.options.map((opt, idx) => (
                            <div key={opt} className="flex items-start space-x-3">
                              <RadioGroupItem value={opt} id={`${q.id}-${idx}`} className="mt-1" />
                              <Label htmlFor={`${q.id}-${idx}`} className="text-sm text-slate-700 cursor-pointer leading-relaxed">
                                {opt}
                              </Label>
                            </div>
                          ))}
                        </RadioGroup>

                        {needsFree && (
                          <Input
                            value={responses[`${q.id}__free`] ?? ""}
                            onChange={(e) => setResponse(`${q.id}__free`, e.target.value)}
                            placeholder="Please specify"
                            data-testid={`survey-${q.id}-free-text`}
                          />
                        )}
                      </div>
                    );
                  }

                  return null;
                })}
              </div>

              <hr className="border-slate-200" />
            </div>

            <div className="flex justify-center">
              <Button
                type="submit"
                disabled={isSubmitting}
                className="bg-green-500 hover:bg-green-600 py-3 px-8 font-semibold"
                data-testid="button-submit-survey"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                    <span>Submitting...</span>
                  </>
                ) : (
                  <>
                    <Check className="mr-2 w-4 h-4" />
                    <span>Submit Feedback</span>
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
