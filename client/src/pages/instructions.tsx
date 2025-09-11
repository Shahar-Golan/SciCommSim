import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Users, Bot, Play } from "lucide-react";

interface InstructionsProps {
  onNext: () => void;
}

export default function Instructions({ onNext }: InstructionsProps) {
  return (
    <div className="space-y-8">
      <div className="text-center space-y-4">
        <h2 className="text-3xl font-bold text-slate-800">Training Instructions</h2>
        <p className="text-lg text-slate-600">
          You'll engage in two voice conversations to practice your science communication skills.
          Imagine you're sitting in a doctor's waiting room when an elderly layperson next to you asks, "So, what is it that you do?"
          Your task is to explain your research in a way that's clear and engaging for someone without a scientific background, and to respond naturally to any questions or comments they might have.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start space-x-4">
              <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0">
                <Users className="text-white w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-800 mb-2">Your Role</h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  You are a STEM researcher explaining your work. Be clear, engaging, and ready to answer questions about your research in simple terms.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-start space-x-4">
              <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center flex-shrink-0">
                <Bot className="text-white w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-800 mb-2">AI's Role</h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  The AI will play an elderly layperson who is curious but has no scientific background. It will ask questions and raise concerns.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center">
          <svg className="w-5 h-5 text-blue-500 mr-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" clipRule="evenodd" />
          </svg>
          What You'll Do
        </h3>
        <div className="space-y-3">
          <div className="flex items-start space-x-3">
            <span className="bg-blue-500 text-white text-xs font-bold px-2 py-1 rounded-full mt-0.5">1</span>
            <p className="text-slate-700 text-sm">Start your first conversation and tell the simulator about your research.</p>
          </div>
          <div className="flex items-start space-x-3">
            <span className="bg-blue-500 text-white text-xs font-bold px-2 py-1 rounded-full mt-0.5">2</span>
            <p className="text-slate-700 text-sm">Review the feedback you receive and decide what you'd like to improve.</p>
          </div>
          <div className="flex items-start space-x-3">
            <span className="bg-blue-500 text-white text-xs font-bold px-2 py-1 rounded-full mt-0.5">3</span>
            <p className="text-slate-700 text-sm">Begin a second conversation, aiming to apply the improvements you identified.</p>
          </div>
          <div className="flex items-start space-x-3">
            <span className="bg-blue-500 text-white text-xs font-bold px-2 py-1 rounded-full mt-0.5">4</span>
            <p className="text-slate-700 text-sm">Complete a brief survey about your experience.</p>
          </div>
        </div>
      </div>

      <div className="text-center mb-6">
        <p className="text-lg font-bold text-slate-800">
          IMPORTANT! Each conversation with the simulator should last at least 5 minutes long
        </p>
      </div>

      <div className="text-center">
        <Button 
          onClick={onNext}
          className="bg-blue-500 hover:bg-blue-600 py-4 px-8 text-lg font-semibold"
          data-testid="button-start-first-conversation"
        >
          <Play className="mr-3 w-5 h-5" />
          <span>START FIRST CONVERSATION</span>
        </Button>
      </div>
    </div>
  );
}
