import { forwardRef, useImperativeHandle } from "react";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, Square } from "lucide-react";
import { useVoiceRecorder, type RecordingResult } from "@/hooks/use-voice-recorder";
import { cn } from "@/lib/utils";

export type VoiceRecorderHandle = {
  pauseRecording: () => void;
  resumeRecording: () => void;
};

interface VoiceRecorderProps {
  onTranscription: (text: string, audioUrl: string | null) => void;
  onError?: (error: string) => void;
  disabled?: boolean;
  conversationId?: string;
  shouldUploadAudio?: boolean;
}

const VoiceRecorder = forwardRef<VoiceRecorderHandle, VoiceRecorderProps>(function VoiceRecorder(
{
  onTranscription,
  onError,
  disabled,
  conversationId,
  shouldUploadAudio = true,
}: VoiceRecorderProps,
ref
) {
  const { isRecording, isProcessing, isPaused, toggleRecording, pauseRecording, resumeRecording } = useVoiceRecorder();

  useImperativeHandle(ref, () => ({
    pauseRecording,
    resumeRecording,
  }), [pauseRecording, resumeRecording]);

  const handleToggleRecording = async () => {
    try {
      const result = await toggleRecording({ conversationId, shouldUploadAudio });
      if (result) {
        onTranscription(result.text, result.audioUrl);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Recording failed';
      onError?.(message);
    }
  };

  return (
    <div className="flex flex-col items-center space-y-4">
      <div className="relative">
        <Button
          onClick={handleToggleRecording}
          disabled={disabled || isProcessing}
          size="lg"
          className={cn(
            "w-24 h-24 rounded-full transition-all duration-200 shadow-lg",
            isPaused
              ? "bg-amber-500 hover:bg-amber-600"
              : isRecording 
              ? "bg-red-500 hover:bg-red-600 animate-pulse" 
              : "bg-blue-500 hover:bg-blue-600"
          )}
          data-testid="voice-recorder-button"
        >
          {isPaused ? (
            <MicOff className="w-8 h-8 text-white" />
          ) : isRecording ? (
            <Square className="w-8 h-8 text-white" />
          ) : (
            <Mic className="w-8 h-8 text-white" />
          )}
        </Button>
        
        {(isRecording || isPaused) && (
          <div className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full animate-pulse">
            <div className="w-full h-full bg-red-500 rounded-full animate-ping"></div>
          </div>
        )}
      </div>

      <div className="text-center space-y-2">
        <p className="text-lg font-medium text-slate-800" data-testid="recording-status">
          {isProcessing 
            ? "Processing..." 
            : isPaused
            ? "Conversation paused"
            : isRecording 
            ? "Recording... Click to stop" 
            : "Click to start speaking"}
        </p>
        <p className="text-sm text-slate-600">
          {isPaused ? "Click Resume to continue the conversation" : "The AI will respond after you finish speaking"}
        </p>
      </div>
    </div>
  );
});

export default VoiceRecorder;
