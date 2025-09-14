import { Heart, ArrowRight, Users, BookOpen, Info, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ThankYouProps {
  onAbout?: () => void;
  onViewSummary?: () => void;
}

export default function ThankYou({ onAbout, onViewSummary }: ThankYouProps) {
  return (
    <div className="text-center space-y-8">
      <div className="space-y-4">
        <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto">
          <Heart className="text-white text-3xl w-10 h-10" />
        </div>
        <h2 className="text-3xl font-bold text-slate-800">Thank You!</h2>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto">
          Your training session is complete. We hope this experience helps you become a more effective science communicator.
        </p>
      </div>

      <div className="bg-green-50 border border-green-200 rounded-xl p-6 max-w-lg mx-auto">
        <h3 className="text-lg font-semibold text-slate-800 mb-3">What's Next?</h3>
        <ul className="text-left space-y-3 text-sm text-slate-700">
          <li className="flex items-start space-x-3">
            <ArrowRight className="text-green-500 mt-1 w-4 h-4 flex-shrink-0" />
            <span>Practice the techniques you learned in real conversations</span>
          </li>
          <li className="flex items-start space-x-3">
            <BookOpen className="text-green-500 mt-1 w-4 h-4 flex-shrink-0" />
            <span>Consider joining a science communication workshop</span>
          </li>
          <li className="flex items-start space-x-3">
            <Users className="text-green-500 mt-1 w-4 h-4 flex-shrink-0" />
            <span>Look for opportunities to present your research to non-experts</span>
          </li>
        </ul>
      </div>

      {/* Session Summary Button */}
      {onViewSummary && (
        <div className="text-center">
          <Button 
            onClick={onViewSummary}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3"
            data-testid="button-view-summary"
          >
            <FileText className="mr-2 w-5 h-5" />
            View & Save Session Summary
          </Button>
          <p className="text-sm text-slate-500 mt-2">
            Download your complete conversation transcripts and feedback
          </p>
        </div>
      )}

      {/* About Us Button */}
      {onAbout && (
        <div className="text-center">
          <Button 
            onClick={onAbout}
            variant="outline"
            className="text-slate-600 hover:text-slate-800"
            data-testid="button-about-us"
          >
            <Info className="mr-2 w-4 h-4" />
            About Us
          </Button>
        </div>
      )}

      <div className="text-slate-600">
        <p className="text-sm" data-testid="completion-message">
          You can now close this window.
        </p>
      </div>
    </div>
  );
}
