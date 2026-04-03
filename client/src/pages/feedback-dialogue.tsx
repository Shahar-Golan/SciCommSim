import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

type ProsodyJobStatus = {
  status: string;
  totalSegments: number;
  processedSegments: number;
};

type ProsodySegmentStatus = {
  id: string;
  segmentIndex: number;
  status: string;
  pitchMeanHz: string | number | null;
  pitchRangeHz: string | number | null;
  energyVariance: string | number | null;
  longPauseCount: number | null;
  pauseFreqPerMin: string | number | null;
  rawMetrics?: Record<string, unknown> | null;
};

type ProsodyStatusResponse = {
  job: ProsodyJobStatus;
  segments: ProsodySegmentStatus[];
};

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatNum(value: number | null, digits = 2): string {
  return value === null ? "-" : value.toFixed(digits);
}

function getSegmentDurationSec(segment: ProsodySegmentStatus): number {
  const step2 = (segment.rawMetrics?.step2 || {}) as Record<string, unknown>;
  const normalizeResult = (step2.normalizeResult || {}) as Record<string, unknown>;
  const durationSec = toNumber(normalizeResult.durationSec);
  return durationSec && durationSec > 0 ? durationSec : 1;
}

function buildProsodyOverview(segments: ProsodySegmentStatus[]) {
  const completed = segments.filter((s) => s.status === "completed");
  if (completed.length === 0) {
    return {
      completedCount: 0,
      weightedPitchMeanHz: null as number | null,
      weightedPitchRangeHz: null as number | null,
      weightedEnergyVariance: null as number | null,
      totalLongPauseCount: 0,
      pauseFreqPerMin: null as number | null,
    };
  }

  let totalWeight = 0;
  let weightedPitchMeanSum = 0;
  let weightedPitchRangeSum = 0;
  let weightedEnergyVarSum = 0;
  let totalLongPauseCount = 0;

  for (const segment of completed) {
    const weight = getSegmentDurationSec(segment);
    totalWeight += weight;

    const pitchMean = toNumber(segment.pitchMeanHz);
    if (pitchMean !== null) weightedPitchMeanSum += pitchMean * weight;

    const pitchRange = toNumber(segment.pitchRangeHz);
    if (pitchRange !== null) weightedPitchRangeSum += pitchRange * weight;

    const energyVar = toNumber(segment.energyVariance);
    if (energyVar !== null) weightedEnergyVarSum += energyVar * weight;

    totalLongPauseCount += segment.longPauseCount || 0;
  }

  const totalDurationMin = totalWeight / 60;

  return {
    completedCount: completed.length,
    weightedPitchMeanHz: totalWeight > 0 ? weightedPitchMeanSum / totalWeight : null,
    weightedPitchRangeHz: totalWeight > 0 ? weightedPitchRangeSum / totalWeight : null,
    weightedEnergyVariance: totalWeight > 0 ? weightedEnergyVarSum / totalWeight : null,
    totalLongPauseCount,
    pauseFreqPerMin: totalDurationMin > 0 ? totalLongPauseCount / totalDurationMin : null,
  };
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
  const [prosodyJob, setProsodyJob] = useState<ProsodyJobStatus | null>(null);
  const [prosodySegments, setProsodySegments] = useState<ProsodySegmentStatus[]>([]);
  const [isProsodyLoading, setIsProsodyLoading] = useState(true);
  const { toast } = useToast();

  const prosodyOverview = buildProsodyOverview(prosodySegments);

  useEffect(() => {
    prepareFeedbackDialogue();
  }, []);

  /* REQUIRED PROSODY CALLS DISABLED
  useEffect(() => {
    fetchProsodyStatus();
  }, [conversationId]);

  useEffect(() => {
    if (!prosodyJob) return;
    if (prosodyJob.status === "completed" || prosodyJob.status === "failed") return;

    const interval = setInterval(() => {
      fetchProsodyStatus(false);
    }, 5000);

    return () => clearInterval(interval);
  }, [conversationId, prosodyJob?.status]);
  */

  const fetchProsodyStatus = async (showErrorToast = true) => {
    setIsProsodyLoading(true);
    try {
      const res = await fetch(`/api/prosody/conversation/${conversationId}/status`, {
        credentials: "include",
      });

      if (res.status === 404) {
        setProsodyJob(null);
        setProsodySegments([]);
        return;
      }

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || "Failed to load prosody status");
      }

      const data: ProsodyStatusResponse = await res.json();
      setProsodyJob(data.job);
      setProsodySegments(data.segments || []);
    } catch (error) {
      console.error("Failed to load prosody status:", error);
      if (showErrorToast) {
        toast({
          title: "Prosody Error",
          description: "Failed to load prosody results.",
          variant: "destructive",
        });
      }
    } finally {
      setIsProsodyLoading(false);
    }
  };

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

      {/* DISABLED
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-700">Prosody Results (Numerical)</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchProsodyStatus(true)}
              data-testid="button-refresh-prosody"
            >
              Refresh
            </Button>
          </div>

          {isProsodyLoading ? (
            <p className="text-slate-600">Loading prosody metrics...</p>
          ) : !prosodyJob ? (
            <p className="text-slate-600">Prosody job not found yet for this conversation.</p>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-lg border bg-white p-3">
                  <div className="text-xs text-slate-500">Job Status</div>
                  <div className="font-semibold text-slate-800" data-testid="prosody-job-status">
                    {prosodyJob.status}
                  </div>
                </div>
                <div className="rounded-lg border bg-white p-3">
                  <div className="text-xs text-slate-500">Processed Segments</div>
                  <div className="font-semibold text-slate-800">
                    {prosodyJob.processedSegments}/{prosodyJob.totalSegments}
                  </div>
                </div>
                <div className="rounded-lg border bg-white p-3">
                  <div className="text-xs text-slate-500">Completed Segments</div>
                  <div className="font-semibold text-slate-800">{prosodyOverview.completedCount}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="rounded-lg border bg-white p-3">
                  <div className="text-xs text-slate-500">Pitch Mean (Hz)</div>
                  <div className="font-semibold text-slate-800" data-testid="prosody-agg-pitch-mean">
                    {formatNum(prosodyOverview.weightedPitchMeanHz, 1)}
                  </div>
                </div>
                <div className="rounded-lg border bg-white p-3">
                  <div className="text-xs text-slate-500">Pitch Range (Hz)</div>
                  <div className="font-semibold text-slate-800" data-testid="prosody-agg-pitch-range">
                    {formatNum(prosodyOverview.weightedPitchRangeHz, 1)}
                  </div>
                </div>
                <div className="rounded-lg border bg-white p-3">
                  <div className="text-xs text-slate-500">Energy Variance</div>
                  <div className="font-semibold text-slate-800" data-testid="prosody-agg-energy-var">
                    {formatNum(prosodyOverview.weightedEnergyVariance, 6)}
                  </div>
                </div>
                <div className="rounded-lg border bg-white p-3">
                  <div className="text-xs text-slate-500">Long Pause Count</div>
                  <div className="font-semibold text-slate-800" data-testid="prosody-agg-long-pauses">
                    {prosodyOverview.totalLongPauseCount}
                  </div>
                </div>
                <div className="rounded-lg border bg-white p-3">
                  <div className="text-xs text-slate-500">Pause Frequency / Min</div>
                  <div className="font-semibold text-slate-800" data-testid="prosody-agg-pause-freq">
                    {formatNum(prosodyOverview.pauseFreqPerMin, 2)}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border bg-white">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Segment</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Duration (s)</TableHead>
                      <TableHead>Pitch Mean (Hz)</TableHead>
                      <TableHead>Pitch Range (Hz)</TableHead>
                      <TableHead>Energy Var</TableHead>
                      <TableHead>Long Pauses</TableHead>
                      <TableHead>Pause/Min</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {prosodySegments.map((segment) => {
                      const duration = getSegmentDurationSec(segment);
                      return (
                        <TableRow key={segment.id} data-testid={`prosody-segment-row-${segment.segmentIndex}`}>
                          <TableCell>{segment.segmentIndex + 1}</TableCell>
                          <TableCell className="capitalize">{segment.status}</TableCell>
                          <TableCell>{formatNum(duration, 2)}</TableCell>
                          <TableCell>{formatNum(toNumber(segment.pitchMeanHz), 1)}</TableCell>
                          <TableCell>{formatNum(toNumber(segment.pitchRangeHz), 1)}</TableCell>
                          <TableCell>{formatNum(toNumber(segment.energyVariance), 6)}</TableCell>
                          <TableCell>{segment.longPauseCount ?? "-"}</TableCell>
                          <TableCell>{formatNum(toNumber(segment.pauseFreqPerMin), 2)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      */}

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
                highlightQuotedText={true}
              />
            </div>

            <div className="space-y-4">
              {!isProcessingTeacher && !isPlayingAudio && (
                <VoiceRecorder
                  conversationId={conversationId}
                  shouldUploadAudio={false}
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
