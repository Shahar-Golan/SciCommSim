import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { BarChart3, Check } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface SurveyProps {
  sessionId: string;
  onNext: () => void;
}

export default function Survey({ sessionId, onNext }: SurveyProps) {
  const [helpfulnessRating, setHelpfulnessRating] = useState<string>("");
  const [experienceFeedback, setExperienceFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!helpfulnessRating) {
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
        helpfulnessRating: parseInt(helpfulnessRating),
        experienceFeedback: experienceFeedback.trim() || null,
        completedAt: new Date().toISOString(),
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
        <h2 className="text-3xl font-bold text-slate-800">Training Complete!</h2>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto">
          Thank you for completing both conversations. Please help us improve by sharing your experience.
        </p>
      </div>

      <Card className="max-w-2xl mx-auto">
        <CardContent className="p-8">
          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Likert Scale Question */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-slate-800">
                How helpful was this training experience for improving your science communication skills?
              </h3>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm text-slate-600">
                  <span>Not helpful at all</span>
                  <span>Extremely helpful</span>
                </div>
                
                <RadioGroup 
                  value={helpfulnessRating} 
                  onValueChange={setHelpfulnessRating}
                  className="flex justify-between"
                  data-testid="helpfulness-rating"
                >
                  {[1, 2, 3, 4, 5].map((value) => (
                    <div key={value} className="flex flex-col items-center space-y-2">
                      <RadioGroupItem 
                        value={value.toString()} 
                        id={`rating-${value}`}
                        className="w-6 h-6"
                        data-testid={`rating-${value}`}
                      />
                      <Label 
                        htmlFor={`rating-${value}`} 
                        className="text-sm font-medium text-slate-700 cursor-pointer"
                      >
                        {value}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            </div>

            <hr className="border-slate-200" />

            {/* Open-ended Question */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-slate-800">
                Please elaborate on your experience with using this simulator
              </h3>
              <Textarea 
                value={experienceFeedback}
                onChange={(e) => setExperienceFeedback(e.target.value)}
                rows={6} 
                className="resize-none"
                placeholder="Share your thoughts about the training experience, what you learned, what could be improved, or any other feedback..."
                data-testid="experience-feedback"
              />
              <p className="text-sm text-slate-500">
                Optional: Your feedback helps us improve the training experience for future students.
              </p>
            </div>

            <hr className="border-slate-200" />

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
