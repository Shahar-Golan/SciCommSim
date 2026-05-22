import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { BarChart3, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { findFirstMissingRequiredAnswer, SURVEY_SECTIONS_ALL, SURVEY_TITLE } from "@/pages/survey-shared";

interface SurveyExplainabilityProps {
  responses: Record<string, string>;
  setResponse: (id: string, value: string) => void;
  onNext: () => void;
}

export default function SurveyExplainability({
  responses,
  setResponse,
  onNext,
}: SurveyExplainabilityProps) {
  const { toast } = useToast();
  const section = SURVEY_SECTIONS_ALL.find((s) => s.title === "Explainability")!;
  const requiredSection = useMemo(() => [section], [section]);

  const renderQuestionText = (text: string) => {
    const match = text.match(/^([^:]+:)(\s*)(.*)$/);
    if (!match) return text;

    const [, subtitleWithColon, spacer, rest] = match;
    return (
      <>
        <span className="font-bold">{subtitleWithColon}</span>
        {spacer}
        {rest}
      </>
    );
  };

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();

    const missingId = findFirstMissingRequiredAnswer(requiredSection, responses);
    if (missingId) {
      toast({
        title: "Incomplete Survey",
        description: "Please answer all required questions before continuing.",
        variant: "destructive",
      });
      return;
    }

    onNext();
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
          <form onSubmit={handleNext} className="space-y-8">
            <div className="space-y-6">
              <div className="space-y-1">
                {section.instructions && <p className="text-sm text-slate-600">{section.instructions}</p>}
              </div>

              <div className="space-y-8">
                {section.questions.map((q) => {
                  if (q.type !== "likert") return null;

                  return (
                    <div key={q.id} className="space-y-3">
                      <p className="font-medium text-slate-800">{renderQuestionText(q.text)}</p>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-xs text-slate-600">
                          <span>{q.leftLabel}</span>
                          <span>{q.rightLabel}</span>
                        </div>

                        <RadioGroup
                          value={responses[q.id] ?? ""}
                          onValueChange={(val) => setResponse(q.id, val)}
                          className="flex justify-between"
                          data-testid={`survey-${q.id}`}
                        >
                          {[1, 2, 3, 4, 5].map((value) => (
                            <div key={value} className="flex flex-col items-center space-y-2">
                              <RadioGroupItem value={value.toString()} id={`${q.id}-${value}`} className="w-6 h-6" />
                              <Label htmlFor={`${q.id}-${value}`} className="text-sm font-medium text-slate-700 cursor-pointer">
                                {value}
                              </Label>
                            </div>
                          ))}
                        </RadioGroup>
                      </div>
                    </div>
                  );
                })}
              </div>

              <hr className="border-slate-200" />
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button type="submit" className="bg-blue-500 hover:bg-blue-600 py-3 px-8 font-semibold" data-testid="button-next-survey">
                <span>Next</span>
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
