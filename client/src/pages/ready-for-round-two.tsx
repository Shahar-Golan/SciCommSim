import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RefreshCw, MessageCircle, ArrowRight } from "lucide-react";

interface ReadyForRoundTwoProps {
  onNext: () => void;
}

export default function ReadyForRoundTwo({ onNext }: ReadyForRoundTwoProps) {
  return (
    <div className="space-y-8">
      <div className="text-center space-y-4">
        <div className="inline-block p-4 bg-gradient-to-br from-purple-100 to-blue-100 rounded-full mb-4">
          <RefreshCw className="w-12 h-12 text-purple-600" />
        </div>
        <h2 className="text-3xl font-bold text-slate-800">Great Work!</h2>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto">
          You've completed your first conversation and received feedback. Take a moment to reflect on what you learned.
        </p>
      </div>

      <Card className="bg-gradient-to-br from-blue-50 to-purple-50 border-blue-200">
        <CardContent className="p-8">
          <h3 className="text-xl font-semibold text-slate-800 mb-4 flex items-center">
            <MessageCircle className="w-6 h-6 text-blue-600 mr-3" />
            Ready for Round Two?
          </h3>
          <div className="space-y-4 text-slate-700">
            <p>
              Now it's time to put your insights into practice! In your second conversation, you'll have another opportunity to explain your research to the same curious layperson.
            </p>
            <div className="bg-white rounded-lg p-4 border border-blue-200">
              <h4 className="font-semibold text-slate-800 mb-2">Tips for this round:</h4>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start">
                  <span className="text-blue-500 mr-2">•</span>
                  <span>Apply the feedback you received from the previous conversation</span>
                </li>
                <li className="flex items-start">
                  <span className="text-blue-500 mr-2">•</span>
                  <span>Try to be even clearer and more engaging</span>
                </li>
                <li className="flex items-start">
                  <span className="text-blue-500 mr-2">•</span>
                  <span>Remember to listen to the questions and respond naturally</span>
                </li>
                <li className="flex items-start">
                  <span className="text-blue-500 mr-2">•</span>
                  <span>Don't worry about being perfect - this is practice!</span>
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-center">
        <Button
          onClick={onNext}
          size="lg"
          className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-lg px-8 py-6"
        >
          Start Second Conversation <ArrowRight className="ml-2 w-5 h-5" />
        </Button>
      </div>

      <div className="text-center text-sm text-slate-500">
        <p>Take your time. When you're ready, click the button above.</p>
      </div>
    </div>
  );
}
