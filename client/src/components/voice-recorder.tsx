import { Button } from "@/components/ui/button";
import { Mic, MicOff, Square } from "lucide-react";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import { cn } from "@/lib/utils";

interface VoiceRecorderProps {
  onTranscription: (text: string) => void;
  onError?: (error: string) => void;
  disabled?: boolean;
}

export default function VoiceRecorder({ onTranscription, onError, disabled }: VoiceRecorderProps) {
  const { isRecording, isProcessing, toggleRecording } = useVoiceRecorder();

  const handleToggleRecording = async () => {
    try {
      const transcription = await toggleRecording();
      if (transcription) {
        onTranscription(transcription);
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
            isRecording 
              ? "bg-red-500 hover:bg-red-600 animate-pulse" 
              : "bg-blue-500 hover:bg-blue-600"
          )}
          data-testid="voice-recorder-button"
        >
          {isRecording ? (
            <Square className="w-8 h-8 text-white" />
          ) : (
            <Mic className="w-8 h-8 text-white" />
          )}
        </Button>
        
        {isRecording && (
          <div className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full animate-pulse">
            <div className="w-full h-full bg-red-500 rounded-full animate-ping"></div>
          </div>
        )}
      </div>

      <div className="text-center space-y-2">
        <p className="text-lg font-medium text-slate-800" data-testid="recording-status">
          {isProcessing 
            ? "Processing..." 
            : isRecording 
            ? "Recording... Click to stop" 
            : "Click to start speaking"}
        </p>
        <p className="text-sm text-slate-600">
          The AI will respond after you finish speaking
        </p>
      </div>
    </div>
  );
}
