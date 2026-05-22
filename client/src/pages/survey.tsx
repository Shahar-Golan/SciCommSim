import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { BarChart3, Check } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type SurveyQuestion =
  | {
      id: string;
      type: "number";
      text: string;
      placeholder?: string;
      required?: boolean;
    }
  | {
      id: string;
      type: "single_choice";
      text: string;
      options: string[];
      required?: boolean;
      freeTextOptionPrefixes?: string[];
    }
  | {
      id: string;
      type: "likert";
      text: string;
      required?: boolean;
      leftLabel: string;
      rightLabel: string;
    }
  | {
      id: string;
      type: "text";
      text: string;
      required?: boolean;
      rows?: number;
      placeholder?: string;
    };

type SurveySection = {
  title: string;
  instructions?: string;
  questions: SurveyQuestion[];
};

const SURVEY_TITLE = "Post Practice Surveys";

const SURVEY_SECTIONS: SurveySection[] = [
  {
    title: "Demographics",
    questions: [
      {
        id: "age",
        type: "number",
        text: "What is your age?",
        placeholder: "Enter your age",
        required: true,
      },
      {
        id: "gender",
        type: "single_choice",
        text: "What is your gender?",
        options: [
          "Male",
          "Female",
          "Non-binary / third gender",
          "Prefer to self describe:",
          "prefer not to say",
        ],
        required: true,
        freeTextOptionPrefixes: ["Prefer to self describe"],
      },
      {
        id: "degree",
        type: "single_choice",
        text: "What degree program are you currently enrolled in?",
        options: ["BA / BSc", "MA / MSc", "PhD / MD", "Other:"],
        required: true,
        freeTextOptionPrefixes: ["Other"],
      },
      {
        id: "field",
        type: "single_choice",
        text: "What is your main field of study?",
        options: [
          "Life Sciences (e.g., Biology, Biochemistry, Biotechnology)",
          "Physical Sciences (e.g., Physics, Chemistry, Earth Sciences)",
          "Engineering or Computer Science",
          "Medicine or Health Sciences",
          "Social Sciences (e.g., Psychology, Sociology, Education, Economics)",
          "Humanities or Arts",
          "Other (please specify):",
        ],
        required: true,
        freeTextOptionPrefixes: ["Other"],
      },
    ],
  },
  {
    title: "Explainability",
    instructions: "Please indicate your level of agreement with the following statements:",
    questions: [
      {
        id: "clarity",
        type: "likert",
        text: "Clarity: The feedback clearly explained my communication during the conversation.",
        leftLabel: "Strongly disagree",
        rightLabel: "Strongly agree",
        required: true,
      },
      {
        id: "understandability",
        type: "likert",
        text: "Understandability: From the feedback, I understand how I communicated during the conversation.",
        leftLabel: "Strongly disagree",
        rightLabel: "Strongly agree",
        required: true,
      },
      {
        id: "completeness",
        type: "likert",
        text: "Completeness: The feedback addressed all the important aspects of my communication.",
        leftLabel: "Strongly disagree",
        rightLabel: "Strongly agree",
        required: true,
      },
      {
        id: "satisfaction",
        type: "likert",
        text: "Satisfaction: The feedback was satisfying in capturing my communication during the conversation.",
        leftLabel: "Strongly disagree",
        rightLabel: "Strongly agree",
        required: true,
      },
      {
        id: "usefulness",
        type: "likert",
        text: "Usefulness: The feedback was useful for improving my communication skills.",
        leftLabel: "Strongly disagree",
        rightLabel: "Strongly agree",
        required: true,
      },
      {
        id: "accuracy",
        type: "likert",
        text: "Accuracy: The feedback accurately reflected my communication during the conversation.",
        leftLabel: "Strongly disagree",
        rightLabel: "Strongly agree",
        required: true,
      },
      {
        id: "insight",
        type: "likert",
        text: "Insight: The feedback provided insights about my communication that I was not aware of during the conversation.",
        leftLabel: "Strongly disagree",
        rightLabel: "Strongly agree",
        required: true,
      },
      {
        id: "explainability_justification",
        type: "likert",
        text: "Explainability (Justification): The feedback helped me understand why the specific comments in the feedback were given to me.",
        leftLabel: "Strongly disagree",
        rightLabel: "Strongly agree",
        required: true,
      },
      {
        id: "explainability_depth",
        type: "likert",
        text: "Explainability (Depth): The feedback provided sufficient explanation for its evaluations.",
        leftLabel: "Strongly disagree",
        rightLabel: "Strongly agree",
        required: true,
      },
      {
        id: "preference",
        type: "likert",
        text: "Preference: I would prefer receiving feedback in this format compared to other forms of feedback (e.g., brief comments, grades only, or no feedback).",
        leftLabel: "Strongly disagree",
        rightLabel: "Strongly agree",
        required: true,
      },
    ],
  },
  {
    title: "User Experience",
    questions: [
      {
        id: "helpfulness",
        type: "likert",
        text: "To what extent did you find the practice helpful for improving your communication skills?",
        leftLabel: "Not helpful at all",
        rightLabel: "Very Helpful",
        required: true,
      },
      {
        id: "recommend",
        type: "likert",
        text: "Please indicate your level of agreement with the following statement: “I would recommend this practice to other students who wish to improve their science communication skills”.",
        leftLabel: "Strongly disagree",
        rightLabel: "Strongly agree",
        required: true,
      },
      {
        id: "changed",
        type: "text",
        text: "In the second conversation, did you change the way you communicated with the simulator? If so, what did you change and why?",
        rows: 5,
        placeholder: "Your answer",
      },
      {
        id: "learned",
        type: "text",
        text: "Did you learn something new during this practice? If so, what did you learn?",
        rows: 4,
        placeholder: "Your answer",
      },
      {
        id: "comments",
        type: "text",
        text: "We would love to hear any comments or suggestions you have regarding this tool:",
        rows: 5,
        placeholder: "Your comments",
      },
    ],
  },
];

function optionNeedsFreeText(option: string, prefixes: string[] | undefined) {
  if (!prefixes?.length) return false;
  const normalized = option.trim().toLowerCase();
  return prefixes.some((p) => normalized.startsWith(p.toLowerCase()));
}

function buildSurveyTextResponse(responses: Record<string, string>) {
  const lines: string[] = [];
  lines.push(SURVEY_TITLE);
  lines.push("");

  for (const section of SURVEY_SECTIONS) {
    lines.push(section.title);
    if (section.instructions) lines.push(section.instructions);

    for (const q of section.questions) {
      const answer = responses[q.id] ?? "";
      const free = responses[`${q.id}__free`] ?? "";
      const combined = free ? `${answer} | ${free}` : answer;
      lines.push(`- ${q.text}`);
      lines.push(`  Answer: ${combined}`);
    }

    lines.push("");
  }

  return lines.join("\n").trim();
}

interface SurveyProps {
  sessionId: string;
  onNext: () => void;
}

export default function Survey({ sessionId, onNext }: SurveyProps) {
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const setResponse = (id: string, value: string) => {
    setResponses((prev) => ({ ...prev, [id]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate required questions (all non-text required questions + age)
    const requiredIds: string[] = [];
    for (const section of SURVEY_SECTIONS) {
      for (const q of section.questions) {
        if (q.required) requiredIds.push(q.id);
      }
    }

    const missingId = requiredIds.find((id) => !responses[id]?.trim());
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
        experienceFeedback: buildSurveyTextResponse(responses) || null,
      });

      onNext();
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
        <p className="text-lg text-slate-600 max-w-2xl mx-auto">
          Thank you for completing both conversations. Please complete the survey below.
        </p>
      </div>

      <Card className="max-w-2xl mx-auto">
        <CardContent className="p-8">
          <form onSubmit={handleSubmit} className="space-y-8">
            {SURVEY_SECTIONS.map((section) => (
              <div key={section.title} className="space-y-6">
                <div className="space-y-1">
                  <h3 className="text-lg font-semibold text-slate-800">{section.title}</h3>
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

                    if (q.type === "likert") {
                      return (
                        <div key={q.id} className="space-y-3">
                          <p className="font-medium text-slate-800">{q.text}</p>
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
                                  <Label
                                    htmlFor={`${q.id}-${value}`}
                                    className="text-sm font-medium text-slate-700 cursor-pointer"
                                  >
                                    {value}
                                  </Label>
                                </div>
                              ))}
                            </RadioGroup>
                          </div>
                        </div>
                      );
                    }

                    // text
                    return (
                      <div key={q.id} className="space-y-3">
                        <p className="font-medium text-slate-800">{q.text}</p>
                        <Textarea
                          value={responses[q.id] ?? ""}
                          onChange={(e) => setResponse(q.id, e.target.value)}
                          rows={q.rows ?? 4}
                          className="resize-none"
                          placeholder={q.placeholder}
                          data-testid={`survey-${q.id}`}
                        />
                      </div>
                    );
                  })}
                </div>

                <hr className="border-slate-200" />
              </div>
            ))}

            {/* Submit */}
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
