import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { GraduationCap, ArrowRight, Play, Info } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface WelcomeProps {
  onNext: (studentId: string, studentName: string) => void;
  onAbout: () => void;
  onTestFeedbackLogin: (email: string) => void;
}

export default function Welcome({ onNext, onAbout, onTestFeedbackLogin }: WelcomeProps) {
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showTestFeedbackLogin, setShowTestFeedbackLogin] = useState(false);
  const [testFeedbackEmail, setTestFeedbackEmail] = useState("");
  const [testFeedbackPassword, setTestFeedbackPassword] = useState("");
  const [showAccessRequestForm, setShowAccessRequestForm] = useState(false);
  const [requestEmail, setRequestEmail] = useState("");
  const [requestPassword, setRequestPassword] = useState("");
  const [isRequestLoading, setIsRequestLoading] = useState(false);
  const [isLoginLoading, setIsLoginLoading] = useState(false);
  
  // Consent form state
  const [consentFormOpen, setConsentFormOpen] = useState(false);
  const [hasReadFullForm, setHasReadFullForm] = useState(false);
  const [consentChoice, setConsentChoice] = useState<string | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  
  const { toast } = useToast();

  const handleConsentFormScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const element = e.currentTarget;
    // Check if scrolled to bottom (within 100px threshold for better detection)
    const isNearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 100;
    if (isNearBottom && !hasReadFullForm) {
      setHasReadFullForm(true);
      console.log("Form read! Enabling checkboxes");
    }
  };

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

    if (!consentChoice) {
      toast({
        title: "Consent Required",
        description: "Please read and respond to the consent form before continuing.",
        variant: "destructive",
      });
      return;
    }

    const consent = consentChoice === "agree" ? "Y" : "N";

    setIsLoading(true);
    try {
      const response = await apiRequest("POST", "/api/students", {
        name: name.trim(),
        consent,
      });
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

    if (!testFeedbackEmail.trim() || !testFeedbackPassword.trim()) {
      toast({
        title: "Missing Credentials",
        description: "Please enter both email and password.",
        variant: "destructive",
      });
      return;
    }

    setIsLoginLoading(true);
    try {
      await apiRequest("POST", "/api/test-feedback/login", {
        email: testFeedbackEmail.trim(),
        password: testFeedbackPassword,
      });

      onTestFeedbackLogin(testFeedbackEmail.trim());
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

    if (!requestEmail.trim() || !requestPassword.trim()) {
      toast({
        title: "Missing Fields",
        description: "Please fill email and password.",
        variant: "destructive",
      });
      return;
    }

    setIsRequestLoading(true);
    try {
      const response = await apiRequest("POST", "/api/test-feedback/access-requests", {
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

      setRequestEmail("");
      setRequestPassword("");
      setShowAccessRequestForm(false);
    } catch (error) {
      console.error("Failed to submit access request:", error);
      toast({
        title: "Request Failed",
        description: "Could not submit request. Email may already exist.",
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
                  <label htmlFor="test-feedback-email" className="block text-sm font-medium text-slate-700 mb-2">
                    Email
                  </label>
                  <Input
                    id="test-feedback-email"
                    type="email"
                    value={testFeedbackEmail}
                    onChange={(e) => setTestFeedbackEmail(e.target.value)}
                    placeholder="Enter email"
                    className="w-full"
                    data-testid="input-test-feedback-email"
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

      {/* Two-column layout: Consent Form + Let's Get Started */}
      <div className="flex gap-6 max-w-4xl mx-auto justify-center">
        {/* Left Card: Consent Form */}
        <Card className="w-full max-w-md">
          <CardContent className="p-8">
            <div className="space-y-6">
              <div className="text-center">
                <h3 className="text-xl font-semibold text-slate-800 mb-2">Consent Form</h3>
                <p className="text-slate-600 text-sm">Please read and respond to the consent form</p>
              </div>

              <Button 
                onClick={() => setConsentFormOpen(true)}
                className="w-full bg-slate-600 hover:bg-slate-700"
                data-testid="button-open-consent-form"
              >
                Open Consent Form
              </Button>

              {/* Consent Checkboxes - Disabled until form is read */}
              <div className="space-y-4 border-t border-slate-200 pt-4">
                <div className="space-y-3">
                  <div className="flex items-center space-x-3">
                    <Checkbox
                      id="consent-agree"
                      checked={consentChoice === "agree"}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setConsentChoice("agree");
                        }
                      }}
                      disabled={!hasReadFullForm}
                      data-testid="checkbox-consent-agree"
                    />
                    <label 
                      htmlFor="consent-agree"
                      className={`text-sm cursor-pointer ${!hasReadFullForm ? "text-slate-400" : "text-slate-700"}`}
                    >
                      I consent to take part in the study
                    </label>
                  </div>

                  <div className="flex items-center space-x-3">
                    <Checkbox
                      id="consent-disagree"
                      checked={consentChoice === "disagree"}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setConsentChoice("disagree");
                        }
                      }}
                      disabled={!hasReadFullForm}
                      data-testid="checkbox-consent-disagree"
                    />
                    <label 
                      htmlFor="consent-disagree"
                      className={`text-sm cursor-pointer ${!hasReadFullForm ? "text-slate-400" : "text-slate-700"}`}
                    >
                      I do not consent to take part in the study
                    </label>
                  </div>
                </div>

                {!hasReadFullForm && (
                  <p className="text-xs text-slate-500 text-center">
                    Read the full form to enable consent options
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Right Card: Let's Get Started */}
        <Card className="w-full max-w-md">
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
                    disabled={isLoading || !consentChoice}
                    data-testid="input-student-name"
                  />
                </div>
                
                <Button 
                  type="submit"
                  className="w-full bg-blue-500 hover:bg-blue-600"
                  disabled={isLoading || !consentChoice}
                  data-testid="button-continue"
                >
                  <span>Continue</span>
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Consent Form Dialog */}
      <Dialog open={consentFormOpen} onOpenChange={setConsentFormOpen}>
        <DialogContent className="max-w-2xl h-[80vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Consent Form - Science Communication Training</DialogTitle>
          </DialogHeader>
          
          <div 
            ref={scrollAreaRef}
            onScroll={handleConsentFormScroll}
            className="flex-1 overflow-y-auto w-full border border-slate-200 rounded"
            data-testid="consent-form-scroll-area"
          >
            <div className="p-4 space-y-4 text-sm text-slate-700">
              <p className="font-semibold">Consent - Science Communication Training</p>
              
              <p className="font-semibold mt-4">Dear Participant,</p>
              
              <p>
                The purpose of this study is to investigate whether large language models (LLMs), such as GPT, can assist students, scientists, and researchers in enhancing their science communication skills. To that end, we developed an LLM-based training app that enables students to practice voice conversations and receive feedback.
              </p>

              <p>
                As part of the study, you will speak twice with a GPT-based application and complete a short survey about your learning experience. The entire task will take approximately 15–20 minutes. Completing the task is a required part of the course as part of your science communication training. However, it is entirely your choice whether to allow the use of your conversation transcripts for research purposes. By giving your consent, you agree that the transcripts of your dialogues and your survey responses may be used for research. You may decline this use without any impact on your course evaluation. The course instructor will not know which students agreed to participate and which did not.
              </p>

              <p className="font-semibold mt-4">Risks:</p>
              <p>
                There are no known risks associated with participation in this study. However, since the simulator is based on OpenAI's GPT-5 model, your conversation data may be used by OpenAI to further train or improve its systems. We therefore encourage you to think carefully about what you choose to share in order to avoid disclosing any sensitive information.
              </p>

              <p className="font-semibold mt-4">Benefits:</p>
              <p>
                This study offers you an opportunity to practice and enhance your science communication skills while also helping us improve and refine the LLM-based simulator for future learners.
              </p>

              <p className="font-semibold mt-4">Compensation:</p>
              <p>
                Participation does not include financial compensation. The task itself is part of the course, but participation in the research is voluntary. You may withdraw from the research component at any time without affecting your course evaluation.
              </p>

              <p className="font-semibold mt-4">Privacy:</p>
              <p>
                All information you provide will be kept confidential. You will be identified in the simulator and the follow-up survey using a unique student number, rather than your name, to protect your privacy. Your dialogue transcripts will be stored in a secure, password-protected database accessible only to authorized members of the research team. Any publications resulting from this study will not include identifying details without your explicit consent.
              </p>

              <p className="font-semibold mt-4">Principal Investigators:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Dr. Elad Yacobson, Faculty of Data and Decision Sciences & Faculty of Education in Science and Technology</li>
                <li>Dr. Tzipora Rakedzon, Department of Humanities and Arts</li>
                <li>Prof. Ayelet Baram-Tsabari, Faculty of Education in Science and Technology</li>
                <li>Prof. Ofra Amir, Faculty of Data and Decision Sciences</li>
                <li>Mr. Shahar Golan, Faculty of Data and Decision Sciences</li>
              </ul>

              <p className="mt-4">
                If you have any questions, you may contact Dr. Elad Yacobson at: <span className="font-semibold">eladyacobson@campus.technion.ac.il</span>
              </p>

            </div>
          </div>

          <div className="border-t border-slate-200 pt-4">
            <Button 
              onClick={() => setConsentFormOpen(false)}
              variant="outline"
              className="w-full"
            >
              Close Form
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
