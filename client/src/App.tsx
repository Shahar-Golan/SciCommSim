import { useState, useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

// Pages
import Welcome from "@/pages/welcome";
import Instructions from "@/pages/instructions";
import Conversation from "@/pages/conversation";
import FeedbackDialogue from "@/pages/feedback-dialogue";
import ReadyForRoundTwo from "@/pages/ready-for-round-two";
import Survey from "@/pages/survey";
import ThankYou from "@/pages/thank-you";
import AdminDashboard from "@/pages/admin-dashboard";
import AboutUs from "@/pages/about-us";
import SessionSummary from "@/pages/session-summary";

type AppState = 
  | "welcome" 
  | "instructions" 
  | "conversation1" 
  | "feedback1" 
  | "break" 
  | "conversation2" 
  | "feedback2" 
  | "survey" 
  | "thankYou"
  | "admin"
  | "aboutUs"
  | "sessionSummary";

interface SessionData {
  studentId: string;
  studentName: string;
  sessionId: string;
  conversation1Id?: string;
  conversation2Id?: string;
}

function App() {
  const [currentState, setCurrentState] = useState<AppState>("welcome");
  const [sessionData, setSessionData] = useState<SessionData>({
    studentId: "",
    studentName: "",
    sessionId: "",
  });

  // Scroll to top when navigating between pages
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [currentState]);

  // Admin access with keyboard shortcut and password protection
  useState(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'A') {
        const password = prompt("Enter admin password:");
        if (password === "SciComTech1") {
          setCurrentState("admin");
        } else if (password !== null) {
          alert("Incorrect password. Access denied.");
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const handleWelcomeNext = async (studentId: string, studentName: string) => {
    try {
      // Create training session
      const response = await fetch("/api/training-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId }),
      });
      
      if (!response.ok) {
        throw new Error("Failed to create session");
      }
      
      const session = await response.json();
      
      setSessionData({
        studentId,
        studentName,
        sessionId: session.id,
      });
      setCurrentState("instructions");
    } catch (error) {
      console.error("Failed to create session:", error);
    }
  };

  const handleInstructionsNext = () => {
    setCurrentState("conversation1");
  };

  const handleConversation1End = (conversationId: string) => {
    setSessionData(prev => ({ ...prev, conversation1Id: conversationId }));
    setCurrentState("feedback1");
  };

  const handleFeedback1Next = () => {
    setCurrentState("break");
  };

  const handleBreakNext = () => {
    setCurrentState("conversation2");
  };

  const handleConversation2End = (conversationId: string) => {
    setSessionData(prev => ({ ...prev, conversation2Id: conversationId }));
    setCurrentState("feedback2");
  };

  const handleFeedback2Next = () => {
    setCurrentState("survey");
  };

  const handleSurveyNext = () => {
    setCurrentState("thankYou");
  };

  const handleShowAbout = () => {
    setCurrentState("aboutUs");
  };

  const handleAboutBack = () => {
    setCurrentState("welcome");
  };

  const handleShowSessionSummary = () => {
    setCurrentState("sessionSummary");
  };

  const handleSessionSummaryBack = () => {
    setCurrentState("thankYou");
  };

  const renderCurrentPage = () => {
    switch (currentState) {
      case "welcome":
        return <Welcome onNext={handleWelcomeNext} onAbout={handleShowAbout} />;
      
      case "instructions":
        return <Instructions onNext={handleInstructionsNext} />;
      
      case "conversation1":
        return (
          <Conversation 
            conversationNumber={1}
            sessionId={sessionData.sessionId}
            onNext={handleConversation1End}
          />
        );
      
      case "feedback1":
        return (
          <FeedbackDialogue 
            conversationId={sessionData.conversation1Id!}
            conversationNumber={1}
            onComplete={handleFeedback1Next}
          />
        );
      
      case "break":
        return <ReadyForRoundTwo onNext={handleBreakNext} />;
      
      case "conversation2":
        return (
          <Conversation 
            conversationNumber={2}
            sessionId={sessionData.sessionId}
            onNext={handleConversation2End}
          />
        );
      
      case "feedback2":
        return (
          <FeedbackDialogue 
            conversationId={sessionData.conversation2Id!}
            conversationNumber={2}
            onComplete={handleFeedback2Next}
          />
        );
      
      case "survey":
        return (
          <Survey 
            sessionId={sessionData.sessionId}
            onNext={handleSurveyNext}
          />
        );
      
      case "thankYou":
        return <ThankYou onAbout={handleShowAbout} onViewSummary={handleShowSessionSummary} />;
      
      case "admin":
        return <AdminDashboard />;
      
      case "aboutUs":
        return <AboutUs onBack={handleAboutBack} />;
      
      case "sessionSummary":
        return <SessionSummary sessionId={sessionData.sessionId} onBack={handleSessionSummaryBack} />;
      
      default:
        return <Welcome onNext={handleWelcomeNext} onAbout={handleShowAbout} />;
    }
  };

  if (currentState === "admin") {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <AdminDashboard />
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        
        {/* Header */}
        <header className="bg-white shadow-sm border-b border-slate-200">
          <div className="max-w-6xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
                  </svg>
                </div>
                <h1 className="text-xl font-semibold text-slate-800">Science Communication Trainer</h1>
              </div>
              <div className="hidden md:flex items-center space-x-4">
                <span className="text-sm text-slate-600">Session Progress</span>
                <div className="flex space-x-2">
                  {["welcome", "instructions", "conversation1", "feedback1", "break", "conversation2", "feedback2", "survey", "thankYou"].map((state, index) => (
                    <div 
                      key={state}
                      className={`w-2 h-2 rounded-full ${
                        ["welcome", "instructions", "conversation1", "feedback1", "break", "conversation2", "feedback2", "survey", "thankYou"].indexOf(currentState) >= index
                          ? "bg-blue-500" 
                          : "bg-slate-300"
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-4xl mx-auto px-4 py-8">
          {renderCurrentPage()}
        </main>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
