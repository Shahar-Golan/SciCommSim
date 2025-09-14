import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { GraduationCap, ArrowRight, Play, Info } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface WelcomeProps {
  onNext: (studentId: string, studentName: string) => void;
  onAbout: () => void;
}

export default function Welcome({ onNext, onAbout }: WelcomeProps) {
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      toast({
        title: "Name Required",
        description: "Please enter your name to continue.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiRequest("POST", "/api/students", { name: name.trim() });
      const student = await response.json();
      onNext(student.id, student.name);
    } catch (error) {
      console.error("Error creating student:", error);
      toast({
        title: "Error",
        description: "Failed to register. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center mx-auto">
          <GraduationCap className="text-white text-2xl w-8 h-8" />
        </div>
        <h2 className="text-3xl font-bold text-slate-800">Welcome to Science Communication Training</h2>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto">
          Practice explaining your research to non-experts through voice conversations with AI. 
          Improve your science communication skills in a safe, supportive environment.
        </p>
      </div>

      {/* Tutorial Video Section */}
      <div className="text-center">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 max-w-lg mx-auto">
          <div className="flex items-center justify-center space-x-3 mb-4">
            <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
              <Play className="text-white w-5 h-5 ml-0.5" />
            </div>
            <h3 className="text-xl font-semibold text-blue-800">Watch the Tutorial First</h3>
          </div>
          <p className="text-blue-700 mb-4">
            Please watch this short tutorial before starting your training session
          </p>
          <Button 
            asChild
            variant="outline"
            className="border-blue-300 text-blue-700 hover:bg-blue-100 px-6 py-2"
            data-testid="button-tutorial"
          >
            <a 
              href="https://youtu.be/hkC_PVCu4oE" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center"
            >
              <Play className="mr-2 w-4 h-4" />
              Watch Tutorial
            </a>
          </Button>
        </div>
      </div>

      <Card className="max-w-md mx-auto">
        <CardContent className="p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="text-center">
              <h3 className="text-xl font-semibold text-slate-800 mb-2">Let's Get Started</h3>
              <p className="text-slate-600 text-sm">Please enter your name to begin your training session</p>
            </div>
            
            <div className="space-y-4">
              <div>
                <label htmlFor="student-name" className="block text-sm font-medium text-slate-700 mb-2">
                  Your Name
                </label>
                <Input
                  id="student-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your full name"
                  className="w-full"
                  disabled={isLoading}
                  data-testid="input-student-name"
                />
              </div>
              
              <Button 
                type="submit"
                className="w-full bg-blue-500 hover:bg-blue-600"
                disabled={isLoading}
                data-testid="button-continue"
              >
                <span>Continue</span>
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* About Us Button */}
      <div className="text-center mt-6">
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
    </div>
  );
}
