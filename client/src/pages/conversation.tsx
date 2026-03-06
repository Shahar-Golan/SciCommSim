import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Pause, Square, Play, Volume2, Clock } from "lucide-react";
import VoiceRecorder from "@/components/voice-recorder";
import ConversationTranscript from "@/components/conversation-transcript";
import { apiRequest } from "@/lib/queryClient";
import { synthesizeSpeech, playAudio } from "@/lib/audio-utils";
import { useToast } from "@/hooks/use-toast";
import type { Message } from "@shared/schema";

interface ConversationProps {
  conversationNumber: number;
  sessionId: string;
  onNext: (conversationId: string) => void;
}

export default function Conversation({ conversationNumber, sessionId, onNext }: ConversationProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string>("");
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [currentAudioUrl, setCurrentAudioUrl] = useState<string>("");
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    initializeConversation();
  }, []);

  // Timer effect
  useEffect(() => {
    if (!startTime) return;

    const timer = setInterval(() => {
      const now = new Date();
      const elapsed = Math.floor((now.getTime() - startTime.getTime()) / 1000);
      setElapsedTime(elapsed);
    }, 1000);

    return () => clearInterval(timer);
  }, [startTime]);

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const initializeConversation = async () => {
    try {
      const response = await apiRequest("POST", "/api/conversations", {
        sessionId,
        conversationNumber,
        transcript: [],
      });
      const conversation = await response.json();
      setConversationId(conversation.id);

      // Start the timer
      setStartTime(new Date());

      // Auto-generate greeting from AI
      const greetingMessage = "Hi! Can you tell me about your research?";
      
      // Generate and upload greeting audio
      let greetingAudioUrl: string | null = null;
      let audioBuffer: string | null = null;
      try {
        const audioResponse = await apiRequest("POST", "/api/audio/upload-ai", {
          text: greetingMessage,
          conversationId: conversation.id,
          timestamp: new Date().toISOString(),
        });
        const audioResult = await audioResponse.json();
        greetingAudioUrl = audioResult.audioUrl;
        audioBuffer = audioResult.audioBuffer;
      } catch (audioError) {
        console.error("Failed to upload greeting audio:", audioError);
        // Continue even if audio upload fails
      }

      const aiMessage = addMessage('ai', greetingMessage, greetingAudioUrl);

      // Update conversation with greeting
      await apiRequest("PATCH", `/api/conversations/${conversation.id}`, {
        transcript: [aiMessage],
      });

      // Play greeting audio from buffer
      if (audioBuffer) {
        try {
          const audioBlob = new Blob(
            [Uint8Array.from(atob(audioBuffer), c => c.charCodeAt(0))],
            { type: 'audio/mpeg' }
          );
          const audioUrl = URL.createObjectURL(audioBlob);
          setCurrentAudioUrl(audioUrl);
          setIsPlayingAudio(true);
          
          await playAudio(audioUrl);
          setIsPlayingAudio(false);
          setAudioProgress(0);
        } catch (audioError) {
          console.error("Failed to play greeting audio:", audioError);
          // Continue even if audio fails
        }
      }
    } catch (error) {
      console.error("Failed to initialize conversation:", error);
      toast({
        title: "Error",
        description: "Failed to start conversation. Please try again.",
        variant: "destructive",
      });
    }
  };

  const addMessage = (role: 'student' | 'ai', content: string, audioUrl?: string | null) => {
    const newMessage: Message = {
      role,
      content,
      timestamp: new Date().toISOString(),
      ...(audioUrl && { audioUrl }), // Only add audioUrl if it exists
    };
    setMessages(prev => [...prev, newMessage]);
    return newMessage;
  };

  const handleStudentTranscription = async (text: string, audioUrl: string | null) => {
    if (!text.trim()) return;

    const studentMessage = addMessage('student', text, audioUrl);
    const updatedMessages = [...messages, studentMessage];

    // Check if student wants to end conversation
    if (text.toLowerCase().includes("we're finished") || text.toLowerCase().includes("were finished")) {
      handleEndConversation();
      return;
    }

    // Update conversation transcript
    try {
      await apiRequest("PATCH", `/api/conversations/${conversationId}`, {
        transcript: updatedMessages,
      });
    } catch (error) {
      console.error("Failed to update transcript:", error);
    }

    // Generate AI response
    setIsProcessingAI(true);
    try {
      const response = await apiRequest("POST", "/api/ai-response", {
        messages: updatedMessages,
      });
      const result = await response.json();
      
      // Generate and upload AI audio
      let aiAudioUrl: string | null = null;
      let audioBuffer: string | null = null;
      try {
        const audioResponse = await apiRequest("POST", "/api/audio/upload-ai", {
          text: result.response,
          conversationId,
          timestamp: new Date().toISOString(),
        });
        const audioResult = await audioResponse.json();
        aiAudioUrl = audioResult.audioUrl;
        audioBuffer = audioResult.audioBuffer;
      } catch (audioError) {
        console.error("Failed to upload AI audio:", audioError);
        // Continue even if audio upload fails
      }

      const aiMessage = addMessage('ai', result.response, aiAudioUrl);
      const finalMessages = [...updatedMessages, aiMessage];

      // Update conversation with AI response
      await apiRequest("PATCH", `/api/conversations/${conversationId}`, {
        transcript: finalMessages,
      });

      // Play audio from buffer
      if (audioBuffer) {
        const audioBlob = new Blob(
          [Uint8Array.from(atob(audioBuffer), c => c.charCodeAt(0))],
          { type: 'audio/mpeg' }
        );
        const audioUrl = URL.createObjectURL(audioBlob);
        setCurrentAudioUrl(audioUrl);
        setIsPlayingAudio(true);
        
        await playAudio(audioUrl);
        setIsPlayingAudio(false);
        setAudioProgress(0);
      }
      
    } catch (error) {
      console.error("Failed to generate AI response:", error);
      toast({
        title: "AI Response Error",
        description: "Failed to generate AI response. Please try speaking again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessingAI(false);
    }
  };

  const handleTranscriptionError = (error: string) => {
    toast({
      title: "Recording Error",
      description: error,
      variant: "destructive",
    });
  };

  const handleEndConversation = async () => {
    try {
      await apiRequest("PATCH", `/api/conversations/${conversationId}`, {
        endedAt: new Date().toISOString(),
        transcript: messages,
        duration: Math.floor((Date.now() - new Date().getTime()) / 1000), // Approximate duration
      });
      onNext(conversationId);
    } catch (error) {
      console.error("Failed to end conversation:", error);
      toast({
        title: "Error",
        description: "Failed to save conversation. Please try again.",
        variant: "destructive",
      });
    }
  };

  const toggleAudioPlayback = async () => {
    if (!currentAudioUrl) return;

    if (isPlayingAudio) {
      // Stop audio
      setIsPlayingAudio(false);
      setAudioProgress(0);
    } else {
      // Play audio
      setIsPlayingAudio(true);
      try {
        await playAudio(currentAudioUrl);
        setIsPlayingAudio(false);
        setAudioProgress(0);
      } catch (error) {
        setIsPlayingAudio(false);
        setAudioProgress(0);
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-slate-800">
          {conversationNumber === 1 ? "First" : "Second"} Conversation
        </h2>
        <p className="text-slate-600">Speak clearly and explain your research to the AI layperson</p>
      </div>

      {/* Stopwatch Timer */}
      <div className="text-center">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 max-w-xs mx-auto">
          <div className="flex items-center justify-center space-x-2">
            <Clock className="w-5 h-5 text-blue-600" />
            <span className="text-lg font-mono font-semibold text-blue-800" data-testid="timer-display">
              {formatTime(elapsedTime)}
            </span>
          </div>
          <p className="text-xs text-blue-600 mt-1">Conversation Time</p>
        </div>
      </div>

      {/* Voice Controls */}
      <Card>
        <CardContent className="p-8">
          <div className="text-center space-y-6">
            <VoiceRecorder 
              onTranscription={handleStudentTranscription}
              onError={handleTranscriptionError}
              disabled={isProcessingAI}
              conversationId={conversationId}
            />

            {/* Conversation Controls */}
            <div className="flex justify-center">
              <Button 
                variant="outline"
                className="px-6 py-2"
                data-testid="button-pause"
              >
                <Pause className="mr-2 w-4 h-4" />
                Pause
              </Button>
            </div>

            {isProcessingAI && (
              <div className="text-center">
                <p className="text-slate-600">AI is thinking...</p>
                <div className="w-32 mx-auto mt-2">
                  <Progress value={50} className="h-1" />
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Conversation Transcript */}
      <ConversationTranscript messages={messages} />

      {/* Audio Playback Controls */}
      {currentAudioUrl && (
        <div className="bg-slate-100 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Button
                onClick={toggleAudioPlayback}
                size="sm"
                className="w-10 h-10 rounded-full bg-green-500 hover:bg-green-600"
                data-testid="button-audio-playback"
              >
                {isPlayingAudio ? (
                  <Pause className="w-4 h-4 text-white" />
                ) : (
                  <Play className="w-4 h-4 text-white" />
                )}
              </Button>
              <div className="flex-1">
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-slate-600">AI Response</span>
                  <div className="flex-1 max-w-48">
                    <Progress value={audioProgress} className="h-2" />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Button variant="ghost" size="sm">
                <Volume2 className="w-4 h-4 text-slate-600" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* End Conversation Button - Isolated at bottom */}
      <div className="mt-8 pt-6 border-t border-slate-200">
        <div className="text-center">
          <p className="text-sm text-slate-500 mb-4">
            When you're ready to finish this conversation
          </p>
          <Button 
            variant="destructive"
            onClick={handleEndConversation}
            className="px-8 py-3"
            data-testid="button-end-conversation"
          >
            <Square className="mr-2 w-4 h-4" />
            End Conversation
          </Button>
        </div>
      </div>
    </div>
  );
}
