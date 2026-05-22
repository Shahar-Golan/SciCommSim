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

  const handleConsentGate = () => {
    if (hasReadFullForm) {
      return false;
    }

    toast({
      title: "Read the consent form first",
      description: "Please scroll through and complete the consent form before continuing.",
      variant: "destructive",
    });

    return true;
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

      {/* Three-phase horizontal flow */}
      <div className="max-w-7xl mx-auto px-4 lg:px-8">
        <div className="flex flex-col items-stretch justify-center gap-4 lg:flex-row lg:items-start lg:gap-6">
          <div className="flex flex-col items-center gap-4 lg:flex-[1.35] lg:min-w-[380px]">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-700 text-lg font-bold text-white shadow-sm ring-8 ring-blue-100">
              1
            </div>
            <div className="w-full max-w-none rounded-2xl border border-blue-200 bg-blue-50/80 p-6 shadow-sm">
              <div className="space-y-4 text-center">
                <div className="flex items-center justify-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500">
                    <Play className="h-5 w-5 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold text-blue-800">Watch the Tutorial First</h3>
                </div>
                <p className="text-sm text-blue-700">
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
                    <Play className="mr-2 h-4 w-4" />
                    Watch Tutorial
                  </a>
                </Button>
              </div>
            </div>
          </div>

          <div className="flex justify-center py-2 lg:items-center lg:py-0">
            <ArrowRight className="hidden h-10 w-10 text-slate-400 lg:block" />
            <ArrowRight className="h-8 w-8 rotate-90 text-slate-400 lg:hidden" />
          </div>

          <div className="flex flex-col items-center gap-4 lg:flex-[1.35] lg:min-w-[380px]">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-700 text-lg font-bold text-white shadow-sm ring-8 ring-blue-100">
              2
            </div>
            <Card className="w-full max-w-none shadow-sm">
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

                  <div className="space-y-4 border-t border-slate-200 pt-4">
                    <div className="space-y-3">
                      <div className="flex items-center space-x-3">
                        <Checkbox
                          id="consent-agree"
                          checked={consentChoice === "agree"}
                          onCheckedChange={(checked) => {
                            if (handleConsentGate()) {
                              return;
                            }

                            if (checked) {
                              setConsentChoice("agree");
                            }
                          }}
                          data-testid="checkbox-consent-agree"
                        />
                        <label
                          htmlFor="consent-agree"
                          className={`text-sm cursor-pointer transition-colors ${hasReadFullForm ? "text-slate-700" : "text-slate-400"}`}
                        >
                          I consent to take part in the study
                        </label>
                      </div>

                      <div className="flex items-center space-x-3">
                        <Checkbox
                          id="consent-disagree"
                          checked={consentChoice === "disagree"}
                          onCheckedChange={(checked) => {
                            if (handleConsentGate()) {
                              return;
                            }

                            if (checked) {
                              setConsentChoice("disagree");
                            }
                          }}
                          data-testid="checkbox-consent-disagree"
                        />
                        <label
                          htmlFor="consent-disagree"
                          className={`text-sm cursor-pointer transition-colors ${hasReadFullForm ? "text-slate-700" : "text-slate-400"}`}
                        >
                          I do not consent to take part in the study
                        </label>
                      </div>
                    </div>

                    {!hasReadFullForm && (
                      <p className="text-xs text-slate-500 text-center">
                        You have to read the full form before proceeding
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-center py-2 lg:items-center lg:py-0">
            <ArrowRight className="hidden h-10 w-10 text-slate-400 lg:block" />
            <ArrowRight className="h-8 w-8 rotate-90 text-slate-400 lg:hidden" />
          </div>

          <div className="flex flex-col items-center gap-4 lg:flex-[1.35] lg:min-w-[380px]">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-700 text-lg font-bold text-white shadow-sm ring-8 ring-blue-100">
              3
            </div>
            <Card className="w-full max-w-none shadow-sm">
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
                        onFocus={() => {
                          if (handleConsentGate()) {
                            return;
                          }
                        }}
                        onClick={() => {
                          if (handleConsentGate()) {
                            return;
                          }
                        }}
                        onChange={(e) => {
                          if (handleConsentGate()) {
                            return;
                          }

                          setName(e.target.value);
                        }}
                        placeholder="Enter your email address"
                        className="w-full"
                        readOnly={!hasReadFullForm}
                        aria-disabled={!hasReadFullForm}
                        disabled={isLoading}
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
        </div>
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
            <div className="p-4 space-y-5 text-sm text-slate-700 leading-relaxed">
              <div className="space-y-1">
                <p className="font-semibold text-slate-800 text-base">
                  Using an LLM-based simulator to train students and researchers in science communication
                </p>
                <p className="text-slate-600 text-sm">
                  Prof. Ayelet Baram-Tsabari1, Prof. Ofra Amir2, Dr. Tzipora Rakedzon3, Dr. Elad Yacobson1,2
                </p>
                <div className="text-xs text-slate-600 space-y-0.5">
                  <p>1 - Faculty of Education in Science and Technology</p>
                  <p>2 - Faculty of Data and Decision Science</p>
                  <p>3 - Department of Humanities and Arts</p>
                </div>
              </div>

              <p className="font-semibold text-slate-800">Dear Participant,</p>

              <p>
                The purpose of this study is to investigate whether large language models (LLMs), such as GPT, can assist students, scientists, and researchers in enhancing their science communication skills. To that end, we developed an LLM-based training app that enables students to practice voice conversations and receive feedback.
              </p>

              <p>
                As part of the study, you will engage in two short voice-based conversations with a GPT-based application and complete a short survey about your learning experience. The entire task will take approximately 15–20 minutes.
              </p>

              <p>
                Completing the task is a required component of the course as part of your science communication training. However, it is entirely your choice whether to allow the use of your conversation transcripts and audio recordings for research purposes. By giving your consent, you agree that the transcripts of your dialogues, the audio recordings of your conversations with the simulator and your survey responses may be used for research. You may decline this use without any impact on your course evaluation. The course instructor will not know which students agreed to participate and which did not.
              </p>

              <p>
                <span className="font-semibold text-slate-800">Risks:</span> There are no known risks associated with participation in this study. However, since the simulator is based on OpenAI’s GPT model, your conversation data may be used by OpenAI to train further or improve its systems. We therefore encourage you to think carefully about what you choose to share to avoid disclosing any sensitive information.
              </p>

              <p>
                <span className="font-semibold text-slate-800">Benefits:</span> This study offers you an opportunity to practice and enhance your science communication skills while also helping us improve and refine the LLM-based simulator for future learners.
              </p>

              <p>
                <span className="font-semibold text-slate-800">Compensation:</span> Participation does not include financial compensation. The task itself is part of the course, but participation in the research is voluntary. You may withdraw from the research component at any time without affecting your course evaluation.
              </p>

              <p>
                <span className="font-semibold text-slate-800">Privacy:</span> All information you provide will be kept confidential. To ensure your privacy is protected, all your data – email address (provided for identification), dialogue transcripts, audio recordings and survey responses – will be stored in a secure, password-protected database accessible only to authorized members of the research team. Any publications resulting from this study will not include identifying details without your explicit consent.
              </p>

              <div className="space-y-2">
                <p className="font-semibold text-slate-800">Principal Investigators:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>
                    Dr. Elad Yacobson, Faculty of Data and Decision Sciences & Faculty of Education in Science and Technology
                  </li>
                  <li>Dr. Tzipora Rakedzon, Department of Humanities and Arts</li>
                  <li>Prof. Ayelet Baram-Tsabari, Faculty of Education in Science and Technology</li>
                  <li>Prof. Ofra Amir, Faculty of Data and Decision Sciences</li>
                </ul>
              </div>

              <p>
                If you have any questions, you may contact Dr. Elad Yacobson at: <span className="font-semibold">eladyacobson@campus.technion.ac.il</span>.
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
