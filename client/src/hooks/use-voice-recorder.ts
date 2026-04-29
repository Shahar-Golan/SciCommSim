import { useState, useRef, useCallback } from 'react';
import { apiRequest } from '@/lib/queryClient';

export interface RecordingResult {
  text: string;
  audioUrl: string | null;
}

export interface RecordingOptions {
  conversationId?: string;
  shouldUploadAudio?: boolean;
}

export function useVoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      setIsPaused(false);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(250); // Collect data every 250ms
      setIsRecording(true);
    } catch (error) {
      console.error('Error starting recording:', error);
      throw new Error('Failed to start recording. Please check microphone permissions.');
    }
  }, []);

  const stopRecording = useCallback((options: RecordingOptions = {}): Promise<RecordingResult> => {
    return new Promise((resolve, reject) => {
      const mediaRecorder = mediaRecorderRef.current;
      if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        reject(new Error('No active recording'));
        return;
      }

      mediaRecorder.onstop = async () => {
        setIsRecording(false);
        setIsPaused(false);
        setIsProcessing(true);

        try {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const timestamp = new Date().toISOString();
          const { conversationId, shouldUploadAudio = true } = options;
          
          // Always transcribe. Audio upload is optional per screen/phase.
          const transcribeFormData = new FormData();
          transcribeFormData.append('audio', audioBlob, 'recording.webm');

          const uploadPromise = shouldUploadAudio
            ? (() => {
                const uploadFormData = new FormData();
                uploadFormData.append('audio', audioBlob, 'recording.webm');
                uploadFormData.append('conversationId', conversationId || 'unknown');
                uploadFormData.append('role', 'student');
                uploadFormData.append('timestamp', timestamp);
                return apiRequest('POST', '/api/audio/upload', uploadFormData)
                  .then(res => res.json())
                  .catch(uploadError => {
                    console.error('Failed to upload audio:', uploadError);
                    return { audioUrl: null }; // Continue even if upload fails
                  });
              })()
            : Promise.resolve({ audioUrl: null });

          const [transcribeResult, uploadResult] = await Promise.all([
            apiRequest('POST', '/api/transcribe', transcribeFormData)
              .then(res => res.json()),

            uploadPromise
          ]);
          
          setIsProcessing(false);
          resolve({ text: transcribeResult.text, audioUrl: uploadResult.audioUrl });
        } catch (error) {
          setIsProcessing(false);
          reject(error);
        } finally {
          // Stop all tracks to release the microphone
          mediaRecorder.stream.getTracks().forEach(track => track.stop());
        }
      };

      mediaRecorder.stop();
    });
  }, []);

  const pauseRecording = useCallback(() => {
    const mediaRecorder = mediaRecorderRef.current;
    if (!mediaRecorder || mediaRecorder.state !== 'recording') {
      return;
    }

    mediaRecorder.pause();
    setIsPaused(true);
  }, []);

  const resumeRecording = useCallback(() => {
    const mediaRecorder = mediaRecorderRef.current;
    if (!mediaRecorder || mediaRecorder.state !== 'paused') {
      return;
    }

    mediaRecorder.resume();
    setIsPaused(false);
  }, []);

  const toggleRecording = useCallback(async (options: RecordingOptions = {}): Promise<RecordingResult | null> => {
    if (isRecording) {
      return await stopRecording(options);
    } else {
      await startRecording();
      return null;
    }
  }, [isRecording, startRecording, stopRecording]);

  return {
    isRecording,
    isProcessing,
    isPaused,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    toggleRecording,
  };
}
