import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, ExternalLink, Mail } from "lucide-react";
import applGroupLogo from "@assets/image_1757837535859.png";
import sciComLogo from "@assets/image_1757837544830.png";

interface AboutUsProps {
  onBack: () => void;
}

export default function AboutUs({ onBack }: AboutUsProps) {
  return (
    <div className="space-y-8">
      <div className="text-center space-y-4">
        <h2 className="text-3xl font-bold text-slate-800">About Us</h2>
      </div>

      <Card className="max-w-4xl mx-auto">
        <CardContent className="p-8">
          <div className="space-y-6">
            {/* Research Group Logos */}
            <div className="flex flex-col md:flex-row items-center justify-center gap-8 mb-8">
              <div className="flex-shrink-0">
                <img 
                  src={sciComLogo} 
                  alt="Applied Science Communication Research Group" 
                  className="h-24 w-auto object-contain"
                />
              </div>
              <div className="flex-shrink-0">
                <img 
                  src={applGroupLogo} 
                  alt="APPL (AI and People) Research Group" 
                  className="h-16 w-auto object-contain"
                />
              </div>
            </div>

            {/* Main Text Content */}
            <div className="text-lg text-slate-700 leading-relaxed space-y-4">
              <p>
                This tool was developed by the Applied Science Communication Research Group at the 
                Technion – Israel Institute of Technology, in cooperation with the APPL (AI and People) 
                Research Group. Its goal is to give scientists and students a safe space to practice 
                dialogic communication.
              </p>
              
              <p>
                The tool is based on OpenAI's GPT-4o large language model.
              </p>
              
              <p>
                For additional reading about productive dialogic communication: 
                <a 
                  href="#" 
                  className="text-blue-600 hover:text-blue-800 underline ml-1"
                  data-testid="link-article"
                >
                  see this article
                  <ExternalLink className="inline w-4 h-4 ml-1" />
                </a>
              </p>
              
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6">
                <p className="text-blue-800 mb-2">
                  <strong>Need Help or Interested in Cooperation?</strong>
                </p>
                <p className="text-blue-700">
                  In any case of problem, or if you're interested in cooperation, feel free to contact us at:
                </p>
                <div className="flex items-center mt-2">
                  <Mail className="w-4 h-4 text-blue-600 mr-2" />
                  <a 
                    href="mailto:eladyacobson@campus.technion.ac.il"
                    className="text-blue-600 hover:text-blue-800 underline"
                    data-testid="link-email"
                  >
                    eladyacobson@campus.technion.ac.il
                  </a>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Back Button */}
      <div className="text-center">
        <Button 
          onClick={onBack}
          variant="outline"
          className="px-6 py-3"
          data-testid="button-back"
        >
          <ArrowLeft className="mr-2 w-4 h-4" />
          Back to Main Page
        </Button>
      </div>
    </div>
  );
}