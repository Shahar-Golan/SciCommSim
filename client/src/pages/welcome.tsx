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
  onTestFeedbackLogin: (username: string) => void;
}

export default function Welcome({ onNext, onAbout, onTestFeedbackLogin }: WelcomeProps) {
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showTestFeedbackLogin, setShowTestFeedbackLogin] = useState(false);
  const [testFeedbackUsername, setTestFeedbackUsername] = useState("");
  const [testFeedbackPassword, setTestFeedbackPassword] = useState("");
  const [showAccessRequestForm, setShowAccessRequestForm] = useState(false);
  const [requestUsername, setRequestUsername] = useState("");
  const [requestEmail, setRequestEmail] = useState("");
  const [requestPassword, setRequestPassword] = useState("");
  const [isRequestLoading, setIsRequestLoading] = useState(false);
  const [isLoginLoading, setIsLoginLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      toast({
        title: "Email Address Required",
        description: "Please enter your email address to continue.",
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

  const handleTestFeedbackLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!testFeedbackUsername.trim() || !testFeedbackPassword.trim()) {
      toast({
        title: "Missing Credentials",
        description: "Please enter both username and password.",
        variant: "destructive",
      });
      return;
    }

    setIsLoginLoading(true);
    try {
      await apiRequest("POST", "/api/test-feedback/login", {
        username: testFeedbackUsername.trim(),
        password: testFeedbackPassword,
      });

      onTestFeedbackLogin(testFeedbackUsername.trim());
    } catch (error) {
      console.error("Test feedback login failed:", error);
      toast({
        title: "Access Denied",
        description: "Your account is not approved yet or credentials are invalid.",
        variant: "destructive",
      });
    } finally {
      setIsLoginLoading(false);
    }
  };

  const handleRequestAccess = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!requestUsername.trim() || !requestEmail.trim() || !requestPassword.trim()) {
      toast({
        title: "Missing Fields",
        description: "Please fill username, email, and password.",
        variant: "destructive",
      });
      return;
    }

    setIsRequestLoading(true);
    try {
      const response = await apiRequest("POST", "/api/test-feedback/access-requests", {
        username: requestUsername.trim(),
        email: requestEmail.trim(),
        password: requestPassword,
      });

      const data = await response.json();

      toast({
        title: "Request Submitted",
        description: data?.adminEmailSent
          ? "Request sent. Admin got an email with approve/reject links."
          : "Request saved, but admin notification email failed.",
      });

      setRequestUsername("");
      setRequestEmail("");
      setRequestPassword("");
      setShowAccessRequestForm(false);
    } catch (error) {
      console.error("Failed to submit access request:", error);
      toast({
        title: "Request Failed",
        description: "Could not submit request. Username or email may already exist.",
        variant: "destructive",
      });
    } finally {
      setIsRequestLoading(false);
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

      <div className="text-center space-y-4">
        <Button
          type="button"
          variant="outline"
          className="text-slate-600 hover:text-slate-800"
          onClick={() => setShowTestFeedbackLogin((prev) => !prev)}
          data-testid="button-test-feedback"
        >
          Test feedback
        </Button>

        {showTestFeedbackLogin && (
          <Card className="max-w-md mx-auto text-left">
            <CardContent className="p-6">
              <form onSubmit={handleTestFeedbackLogin} className="space-y-4">
                <div>
                  <label htmlFor="test-feedback-username" className="block text-sm font-medium text-slate-700 mb-2">
                    Username
                  </label>
                  <Input
                    id="test-feedback-username"
                    type="text"
                    value={testFeedbackUsername}
                    onChange={(e) => setTestFeedbackUsername(e.target.value)}
                    placeholder="Enter username"
                    className="w-full"
                    data-testid="input-test-feedback-username"
                  />
                </div>

                <div>
                  <label htmlFor="test-feedback-password" className="block text-sm font-medium text-slate-700 mb-2">
                    Password
                  </label>
                  <Input
                    id="test-feedback-password"
                    type="password"
                    value={testFeedbackPassword}
                    onChange={(e) => setTestFeedbackPassword(e.target.value)}
                    placeholder="Enter password"
                    className="w-full"
                    data-testid="input-test-feedback-password"
                  />
                </div>

                <Button type="submit" className="w-full" data-testid="button-test-feedback-login" disabled={isLoginLoading}>
                  Enter Test feedback
                </Button>
              </form>

              <div className="mt-4 border-t border-slate-200 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => setShowAccessRequestForm((prev) => !prev)}
                  data-testid="button-request-access-toggle"
                >
                  {showAccessRequestForm ? "Cancel request" : "Request access"}
                </Button>

                {showAccessRequestForm && (
                  <form onSubmit={handleRequestAccess} className="space-y-3 mt-4">
                    <div>
                      <label htmlFor="request-access-username" className="block text-sm font-medium text-slate-700 mb-2">
                        Username
                      </label>
                      <Input
                        id="request-access-username"
                        type="text"
                        value={requestUsername}
                        onChange={(e) => setRequestUsername(e.target.value)}
                        placeholder="Choose username"
                        className="w-full"
                        data-testid="input-request-access-username"
                      />
                    </div>

                    <div>
                      <label htmlFor="request-access-email" className="block text-sm font-medium text-slate-700 mb-2">
                        Email
                      </label>
                      <Input
                        id="request-access-email"
                        type="email"
                        value={requestEmail}
                        onChange={(e) => setRequestEmail(e.target.value)}
                        placeholder="your@email.com"
                        className="w-full"
                        data-testid="input-request-access-email"
                      />
                    </div>

                    <div>
                      <label htmlFor="request-access-password" className="block text-sm font-medium text-slate-700 mb-2">
                        Password
                      </label>
                      <Input
                        id="request-access-password"
                        type="password"
                        value={requestPassword}
                        onChange={(e) => setRequestPassword(e.target.value)}
                        placeholder="Create a password"
                        className="w-full"
                        data-testid="input-request-access-password"
                      />
                    </div>

                    <Button type="submit" className="w-full" disabled={isRequestLoading} data-testid="button-request-access-submit">
                      Submit approval request
                    </Button>
                  </form>
                )}
              </div>
            </CardContent>
          </Card>
        )}
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
              <p className="text-slate-600 text-sm">Please enter your email address to begin your training session</p>
            </div>
            
            <div className="space-y-4">
              <div>
                <label htmlFor="student-name" className="block text-sm font-medium text-slate-700 mb-2">
                  Your Email Address
                </label>
                <Input
                  id="student-name"
                  type="email"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your email address"
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

      <div className="text-center mt-6">
      {/* About Us Button */}
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
