import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Volume2, MessageSquare, ArrowRight } from "lucide-react";
import VoiceRecorder from "@/components/voice-recorder";
import ConversationTranscript from "@/components/conversation-transcript";
import { apiRequest } from "@/lib/queryClient";
import { playAudio } from "@/lib/audio-utils";
import { useToast } from "@/hooks/use-toast";
import type { FeedbackMessage } from "@shared/schema";

interface FeedbackDialogueProps {
  conversationId: string;
  conversationNumber: number;
  onComplete: () => void;
}

export default function FeedbackDialogue({ 
  conversationId, 
  conversationNumber,
  onComplete 
}: FeedbackDialogueProps) {
  const [messages, setMessages] = useState<FeedbackMessage[]>([]);
  const [feedbackId, setFeedbackId] = useState<string>("");
  const [isProcessingTeacher, setIsProcessingTeacher] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [isPreparingFeedback, setIsPreparingFeedback] = useState(true);
  const [feedbackReady, setFeedbackReady] = useState(false);
  const [firstMessage, setFirstMessage] = useState<any>(null);
  const { toast } = useToast();

  useEffect(() => {
    prepareFeedbackDialogue();
  }, []);

  const prepareFeedbackDialogue = async () => {
    try {
      setIsPreparingFeedback(true);
      
      // First, generate feedback analysis (backend will fetch conversation)
      const feedbackResponse = await apiRequest("POST", "/api/feedback", {
        conversationId,
      });
      
      const feedbackData = await feedbackResponse.json();
      
      // Prepare the dialogue (but don't start it yet)
      const dialogueResponse = await apiRequest("POST", "/api/feedback-dialogue/start", {
        conversationId,
        feedbackId: feedbackData.id,
      });
      
      const result = await dialogueResponse.json();
      setFeedbackId(result.feedbackId);
      setFirstMessage(result);
      setIsPreparingFeedback(false);
      setFeedbackReady(true);
    } catch (error) {
      console.error("Failed to prepare feedback dialogue:", error);
      setIsPreparingFeedback(false);
      toast({
        title: "Error",
        description: "Failed to prepare feedback dialogue. Please try again.",
        variant: "destructive",
      });
    }
  };

  const startFeedbackDialogue = async () => {
    if (!firstMessage) return;
    
    try {
      setMessages([firstMessage.message]);
      setHasStarted(true);
      setFeedbackReady(false);

      // Play the greeting
      if (firstMessage.audioBuffer) {
        try {
          const audioBlob = new Blob(
            [Uint8Array.from(atob(firstMessage.audioBuffer), c => c.charCodeAt(0))],
            { type: 'audio/mpeg' }
          );
          const audioUrl = URL.createObjectURL(audioBlob);
          setIsPlayingAudio(true);
          
          await playAudio(audioUrl);
          setIsPlayingAudio(false);
        } catch (audioError) {
          console.error("Failed to play audio:", audioError);
          setIsPlayingAudio(false);
        }
      }
    } catch (error) {
      console.error("Failed to start feedback dialogue:", error);
      toast({
        title: "Error",
        description: "Failed to start feedback dialogue. Please try again.",
        variant: "destructive",
      });
    }
  };

  const addMessage = (role: 'student' | 'teacher', content: string, audioUrl?: string) => {
    const newMessage: FeedbackMessage = {
      role,
      content,
      timestamp: new Date().toISOString(),
      audioUrl,
    };
    setMessages(prev => [...prev, newMessage]);
    return newMessage;
  };

  const handleStudentResponse = async (text: string, audioUrl: string | null) => {
    if (!text.trim()) return;

    const studentMessage = addMessage('student', text, audioUrl || undefined);

    // Generate teacher response
    setIsProcessingTeacher(true);
    try {
      const response = await apiRequest("POST", "/api/feedback-dialogue/respond", {
        conversationId,
        feedbackId,
        message: studentMessage,
      });
      const result = await response.json();
      
      addMessage('teacher', result.response.content, result.response.audioUrl);

      // Play teacher response audio
      if (result.audioBuffer) {
        const audioBlob = new Blob(
          [Uint8Array.from(atob(result.audioBuffer), c => c.charCodeAt(0))],
          { type: 'audio/mpeg' }
        );
        const audioUrl = URL.createObjectURL(audioBlob);
        setIsPlayingAudio(true);
        
        await playAudio(audioUrl);
        setIsPlayingAudio(false);
      }
    } catch (error) {
      console.error("Failed to get teacher response:", error);
      toast({
        title: "Error",
        description: "Failed to get response. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessingTeacher(false);
    }
  };

  const handleComplete = async () => {
    try {
      await apiRequest("POST", "/api/feedback-dialogue/complete", {
        conversationId,
        feedbackId,
      });
      onComplete();
    } catch (error) {
      console.error("Failed to complete dialogue:", error);
      toast({
        title: "Error",
        description: "Failed to complete dialogue. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (isPreparingFeedback) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-slate-600">Preparing your feedback...</p>
        </div>
      </div>
    );
  }

  if (feedbackReady && !hasStarted) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <Card className="max-w-2xl w-full">
          <CardContent className="pt-6">
            <div className="text-center space-y-6">
              <div className="mx-auto w-20 h-20 bg-gradient-to-br from-purple-100 to-blue-100 rounded-full flex items-center justify-center">
                <MessageSquare className="w-10 h-10 text-purple-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-800 mb-2">
                  Feedback Ready - Conversation {conversationNumber}
                </h2>
                <p className="text-slate-600">
                  Your feedback has been prepared and is ready to begin. Press the button below when you're ready to start the feedback dialogue with your coach.
                </p>
              </div>
              <Button
                onClick={startFeedbackDialogue}
                size="lg"
                className="bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
              >
                <Volume2 className="mr-2 w-5 h-5" />
                Start Feedback Dialogue
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="bg-gradient-to-br from-purple-50 to-blue-50 border-purple-200">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-purple-100 rounded-lg">
              <MessageSquare className="w-6 h-6 text-purple-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-slate-800 mb-2">
                Feedback Dialogue - Conversation {conversationNumber}
              </h2>
              <p className="text-slate-600">
                Your coach will share feedback on your conversation. Listen and feel free to ask questions or share your thoughts.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-700 flex items-center gap-2">
                <Volume2 className="w-5 h-5" />
                Feedback Discussion
              </h3>
            </div>

            <div className="mb-6 max-h-96 overflow-y-auto">
              <ConversationTranscript 
                messages={messages.map(m => ({
                  ...m,
                  role: m.role === 'teacher' ? 'ai' : 'student'
                }))} 
              />
            </div>

            <div className="space-y-4">
              {!isProcessingTeacher && !isPlayingAudio && (
                <VoiceRecorder
                  conversationId={conversationId}
                  onTranscription={handleStudentResponse}
                  disabled={isProcessingTeacher || isPlayingAudio}
                />
              )}

              {isProcessingTeacher && (
                <div className="flex items-center justify-center py-4 text-purple-600">
                  <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin mr-2"></div>
                  <span>Teacher is thinking...</span>
                </div>
              )}

              {isPlayingAudio && (
                <div className="flex items-center justify-center py-4 text-blue-600">
                  <Volume2 className="w-6 h-6 mr-2 animate-pulse" />
                  <span>Playing teacher response...</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={handleComplete}
              disabled={isProcessingTeacher || isPlayingAudio}
              className="bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
            >
              Complete Feedback <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
