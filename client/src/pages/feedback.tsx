import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { TrendingUp, RotateCcw, FileText, Eye, EyeOff } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import ConversationTranscript from "@/components/conversation-transcript";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Feedback, Message } from "@shared/schema";

interface FeedbackProps {
  conversationId: string;
  conversationNumber: number;
  onNext: () => void;
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
    const w = getSegmentDurationSec(segment);
    totalWeight += w;

    const pitchMean = toNumber(segment.pitchMeanHz);
    if (pitchMean !== null) weightedPitchMeanSum += pitchMean * w;

    const pitchRange = toNumber(segment.pitchRangeHz);
    if (pitchRange !== null) weightedPitchRangeSum += pitchRange * w;

    const energyVar = toNumber(segment.energyVariance);
    if (energyVar !== null) weightedEnergyVarSum += energyVar * w;

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

export default function FeedbackPage({ conversationId, conversationNumber, onNext }: FeedbackProps) {
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [conversationMessages, setConversationMessages] = useState<Message[]>([]);
  const [showTranscript, setShowTranscript] = useState(false);
  const [prosodyJob, setProsodyJob] = useState<ProsodyJobStatus | null>(null);
  const [prosodySegments, setProsodySegments] = useState<ProsodySegmentStatus[]>([]);
  const [isProsodyLoading, setIsProsodyLoading] = useState(true);
  const { toast } = useToast();

  const prosodyOverview = buildProsodyOverview(prosodySegments);

  useEffect(() => {
    generateFeedback();
  }, [conversationId]);

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

  const generateFeedback = async () => {
    console.log("generateFeedback called with conversationId:", conversationId);
    setIsLoading(true);
    try {
      // First, get the conversation to extract messages
      console.log("Fetching conversation...");
      const conversationResponse = await fetch(`/api/conversations/${conversationId}`, {
        credentials: "include",
      });
      
      console.log("Conversation response status:", conversationResponse.status);
      
      if (!conversationResponse.ok) {
        const errorText = await conversationResponse.text();
        console.error("Conversation fetch error:", errorText);
        throw new Error("Failed to fetch conversation");
      }
      
      const conversation = await conversationResponse.json();
      console.log("Got conversation:", conversation);
      
      // Store the conversation messages for transcript display
      setConversationMessages(conversation.transcript || []);
      
      // Generate feedback based on conversation messages
      console.log("About to call feedback API with:", {
        conversationId,
        messages: conversation.transcript || [],
      });
      
      // Use raw fetch instead of apiRequest to handle errors manually
      const feedbackResponse = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          conversationId,
          messages: conversation.transcript || [],
        }),
        credentials: "include",
      });
      
      console.log("Feedback response status:", feedbackResponse.status, feedbackResponse.statusText);
      
      if (!feedbackResponse.ok) {
        const errorText = await feedbackResponse.text();
        console.error("Feedback API error:", errorText);
        throw new Error("Failed to generate feedback");
      }
      
      const feedbackData = await feedbackResponse.json();
      setFeedback(feedbackData);
    } catch (error) {
      console.error("Failed to generate feedback:", error);
      toast({
        title: "Feedback Error",
        description: "Failed to generate feedback. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-slate-600">Analyzing your conversation...</p>
        </div>
      </div>
    );
  }

  if (!feedback) {
    return (
      <div className="text-center space-y-4">
        <p className="text-slate-600">Failed to generate feedback.</p>
        <Button onClick={generateFeedback} variant="outline">
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto">
          <TrendingUp className="text-white text-2xl w-8 h-8" />
        </div>
        <h2 className="text-3xl font-bold text-slate-800">Your Performance Feedback</h2>
        <p className="text-lg text-slate-600">
          {conversationNumber === 1 ? "First" : "Second"} conversation completed! Here's how you did:
        </p>
      </div>

      <div className="max-w-4xl mx-auto space-y-6">
        {/* Strengths */}
        {feedback.strengths && (
          <div className="bg-green-50 rounded-xl shadow-sm border border-green-200 p-8">
            <h3 className="text-xl font-semibold text-green-800 mb-4 flex items-center">
              <div className="w-3 h-3 bg-green-500 rounded-full mr-3"></div>
              What You Did Well
            </h3>
            <p className="text-green-700 leading-relaxed">{feedback.strengths}</p>
          </div>
        )}

        {/* Points for Improvement */}
        {feedback.improvements && (
          <div className="bg-blue-50 rounded-xl shadow-sm border border-blue-200 p-8">
            <h3 className="text-xl font-semibold text-blue-800 mb-4 flex items-center">
              <div className="w-3 h-3 bg-blue-500 rounded-full mr-3"></div>
              Points for Improvement
            </h3>
            <p className="text-blue-700 leading-relaxed">{feedback.improvements}</p>
          </div>
        )}

        {/* Prosody results table (Step 4) */}
        <div className="bg-slate-50 rounded-xl shadow-sm border border-slate-200 p-8 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold text-slate-800">Prosody Results (Numerical)</h3>
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
                  <div className="font-semibold text-slate-800">
                    {prosodyOverview.completedCount}
                  </div>
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
        </div>

      </div>

      {/* View Transcript Button */}
      <div className="text-center">
        <Button 
          onClick={() => setShowTranscript(!showTranscript)}
          variant="outline"
          className="px-6 py-3"
          data-testid="button-toggle-transcript"
        >
          {showTranscript ? (
            <>
              <EyeOff className="mr-2 w-4 h-4" />
              Hide Conversation Transcript
            </>
          ) : (
            <>
              <Eye className="mr-2 w-4 h-4" />
              View Conversation Transcript
            </>
          )}
        </Button>
      </div>

      {/* Conversation Transcript */}
      {showTranscript && conversationMessages.length > 0 && (
        <div className="max-w-4xl mx-auto">
          <ConversationTranscript messages={conversationMessages} />
        </div>
      )}

      <div className="text-center">
        <Button 
          onClick={onNext}
          className="bg-blue-500 hover:bg-blue-600 py-4 px-8 text-lg font-semibold"
          data-testid={conversationNumber === 1 ? "button-start-second-conversation" : "button-continue-to-survey"}
        >
          {conversationNumber === 1 ? (
            <>
              <RotateCcw className="mr-3 w-5 h-5" />
              <span>START SECOND CONVERSATION</span>
            </>
          ) : (
            <>
              <span>Continue to Survey</span>
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
