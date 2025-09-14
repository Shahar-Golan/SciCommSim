import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Download, ArrowLeft, Clock, MessageCircle, ThumbsUp, Target } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Message {
  role: 'student' | 'ai';
  content: string;
  timestamp: string;
  audioUrl?: string;
}

interface Conversation {
  id: string;
  sessionId: string;
  conversationNumber: number;
  startedAt: string;
  endedAt: string | null;
  transcript: Message[];
  duration: number | null;
}

interface Feedback {
  id: string;
  conversationId: string;
  strengths: string | null;
  improvements: string | null;
  summary: string | null;
  createdAt: string;
}

interface Student {
  id: string;
  name: string;
}

interface TrainingSession {
  id: string;
  studentId: string;
  startedAt: string;
  completedAt: string | null;
  helpfulnessRating: number | null;
  experienceFeedback: string | null;
}

interface SessionSummaryData {
  session: TrainingSession;
  student: Student;
  conversations: Array<{
    conversation: Conversation;
    feedback: Feedback | null;
  }>;
}

interface SessionSummaryProps {
  sessionId: string;
  onBack: () => void;
}

export default function SessionSummary({ sessionId, onBack }: SessionSummaryProps) {
  const [sessionData, setSessionData] = useState<SessionSummaryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchSessionSummary();
  }, [sessionId]);

  const fetchSessionSummary = async () => {
    try {
      const response = await fetch(`/api/training-sessions/${sessionId}/summary`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch session summary");
      }

      const data = await response.json();
      setSessionData(data);
    } catch (error) {
      console.error("Error fetching session summary:", error);
      toast({
        title: "Error",
        description: "Failed to load session summary. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleString();
  };

  const formatDuration = (seconds: number | null): string => {
    if (!seconds) return "Unknown";
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const generateTextSummary = (): string => {
    if (!sessionData) return "";

    const lines = [
      "=".repeat(60),
      "SCIENCE COMMUNICATION TRAINING SESSION SUMMARY",
      "=".repeat(60),
      "",
      `Student: ${sessionData.student.name}`,
      `Session Date: ${formatDate(sessionData.session.startedAt)}`,
      `Completion Date: ${sessionData.session.completedAt ? formatDate(sessionData.session.completedAt) : 'In Progress'}`,
      `Helpfulness Rating: ${sessionData.session.helpfulnessRating ? `${sessionData.session.helpfulnessRating}/5` : 'Not rated'}`,
      "",
    ];

    if (sessionData.session.experienceFeedback) {
      lines.push("Experience Feedback:");
      lines.push(`"${sessionData.session.experienceFeedback}"`);
      lines.push("");
    }

    sessionData.conversations.forEach(({ conversation, feedback }, index) => {
      lines.push(`${"=".repeat(40)}`);
      lines.push(`CONVERSATION ${conversation.conversationNumber}`);
      lines.push(`${"=".repeat(40)}`);
      lines.push(`Started: ${formatDate(conversation.startedAt)}`);
      lines.push(`Duration: ${formatDuration(conversation.duration)}`);
      lines.push("");

      lines.push("TRANSCRIPT:");
      lines.push("-".repeat(20));
      
      if (conversation.transcript.length === 0) {
        lines.push("No conversation recorded.");
      } else if (conversation.transcript.length === 1 && conversation.transcript[0].role === 'ai') {
        lines.push("Session ended early - no student response recorded.");
        lines.push("");
        lines.push(`AI: ${conversation.transcript[0].content}`);
      } else {
        conversation.transcript.forEach(message => {
          const speaker = message.role === 'ai' ? 'AI' : 'Student';
          const time = new Date(message.timestamp).toLocaleTimeString();
          lines.push(`${speaker} (${time}): ${message.content}`);
        });
      }

      lines.push("");

      if (feedback) {
        lines.push("FEEDBACK:");
        lines.push("-".repeat(20));
        
        if (feedback.strengths) {
          lines.push("Strengths:");
          lines.push(feedback.strengths);
          lines.push("");
        }

        if (feedback.improvements) {
          lines.push("Areas for Improvement:");
          lines.push(feedback.improvements);
          lines.push("");
        }

      } else {
        lines.push("No feedback available for this conversation.");
        lines.push("");
      }
    });

    lines.push("=".repeat(60));
    lines.push("End of Session Summary");
    lines.push("=".repeat(60));

    return lines.join('\n');
  };

  const downloadSummary = () => {
    const textSummary = generateTextSummary();
    const blob = new Blob([textSummary], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `science-communication-session-${sessionData?.student.name || 'unknown'}-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({
      title: "Download Complete",
      description: "Your session summary has been downloaded.",
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading your session summary...</p>
        </div>
      </div>
    );
  }

  if (!sessionData) {
    return (
      <div className="text-center space-y-4">
        <h2 className="text-2xl font-bold text-slate-800">Session Not Found</h2>
        <p className="text-slate-600">Unable to load your session summary.</p>
        <Button onClick={onBack} variant="outline" data-testid="button-back">
          <ArrowLeft className="mr-2 w-4 h-4" />
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-3xl font-bold text-slate-800">Session Summary</h2>
          <p className="text-slate-600 mt-2">
            Complete transcript and feedback for your science communication training
          </p>
        </div>
        <div className="flex gap-3">
          <Button onClick={downloadSummary} className="bg-blue-600 hover:bg-blue-700" data-testid="button-download">
            <Download className="mr-2 w-4 h-4" />
            Download Summary
          </Button>
          <Button onClick={onBack} variant="outline" data-testid="button-back">
            <ArrowLeft className="mr-2 w-4 h-4" />
            Back
          </Button>
        </div>
      </div>

      {/* Session Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-blue-600" />
            Session Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-slate-500 font-medium">Student</p>
              <p className="text-slate-800">{sessionData.student.name}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Started</p>
              <p className="text-slate-800">{formatDate(sessionData.session.startedAt)}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Completed</p>
              <p className="text-slate-800">
                {sessionData.session.completedAt ? formatDate(sessionData.session.completedAt) : 'In Progress'}
              </p>
            </div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Rating</p>
              <p className="text-slate-800">
                {sessionData.session.helpfulnessRating ? (
                  <Badge variant="secondary">{sessionData.session.helpfulnessRating}/5</Badge>
                ) : (
                  <span className="text-slate-500">Not rated</span>
                )}
              </p>
            </div>
          </div>
          
          {sessionData.session.experienceFeedback && (
            <div>
              <p className="text-sm text-slate-500 font-medium mb-2">Experience Feedback</p>
              <p className="text-slate-700 bg-slate-50 p-3 rounded-lg italic">
                "{sessionData.session.experienceFeedback}"
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Conversations */}
      {sessionData.conversations.map(({ conversation, feedback }, index) => (
        <Card key={conversation.id}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-blue-600" />
              Conversation {conversation.conversationNumber}
              <div className="flex items-center gap-2 text-sm text-slate-500 ml-auto">
                <Clock className="w-4 h-4" />
                {formatDuration(conversation.duration)}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Conversation Details */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-slate-500 font-medium">Started:</span>{" "}
                {formatDate(conversation.startedAt)}
              </div>
              <div>
                <span className="text-slate-500 font-medium">Messages:</span>{" "}
                {conversation.transcript.length}
              </div>
            </div>

            {/* Transcript */}
            <div>
              <h4 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                <MessageCircle className="w-4 h-4" />
                Transcript
              </h4>
              <div className="bg-slate-50 rounded-lg p-4 space-y-3 max-h-96 overflow-y-auto">
                {conversation.transcript.length === 0 ? (
                  <p className="text-slate-500 italic">No conversation recorded.</p>
                ) : conversation.transcript.length === 1 && conversation.transcript[0].role === 'ai' ? (
                  <div className="space-y-2">
                    <p className="text-slate-500 italic">Session ended early - no student response recorded.</p>
                    <div className="bg-blue-50 border-l-4 border-blue-500 p-3 rounded">
                      <div className="flex items-start gap-2">
                        <Badge variant="secondary" className="mt-1">AI</Badge>
                        <div>
                          <p className="text-slate-800">{conversation.transcript[0].content}</p>
                          <p className="text-xs text-slate-500 mt-1">
                            {new Date(conversation.transcript[0].timestamp).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  conversation.transcript.map((message, msgIndex) => (
                    <div
                      key={msgIndex}
                      className={`p-3 rounded border-l-4 ${
                        message.role === 'ai'
                          ? 'bg-blue-50 border-blue-500'
                          : 'bg-green-50 border-green-500'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <Badge variant={message.role === 'ai' ? 'secondary' : 'default'} className="mt-1">
                          {message.role === 'ai' ? 'AI' : 'Student'}
                        </Badge>
                        <div>
                          <p className="text-slate-800">{message.content}</p>
                          <p className="text-xs text-slate-500 mt-1">
                            {new Date(message.timestamp).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Feedback */}
            {feedback ? (
              <div>
                <h4 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                  <Target className="w-4 h-4" />
                  AI Feedback
                </h4>
                <div className="space-y-4">
                  {feedback.strengths && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <h5 className="font-medium text-green-800 mb-2 flex items-center gap-2">
                        <ThumbsUp className="w-4 h-4" />
                        Strengths
                      </h5>
                      <p className="text-green-700">{feedback.strengths}</p>
                    </div>
                  )}

                  {feedback.improvements && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                      <h5 className="font-medium text-amber-800 mb-2 flex items-center gap-2">
                        <Target className="w-4 h-4" />
                        Areas for Improvement
                      </h5>
                      <p className="text-amber-700">{feedback.improvements}</p>
                    </div>
                  )}

                </div>
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                <p className="text-slate-500 italic">No feedback available for this conversation.</p>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}