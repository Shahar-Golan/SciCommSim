import { useState, useRef, useCallback } from 'react';
import { apiRequest } from '@/lib/queryClient';

export interface RecordingResult {
  text: string;
  audioUrl: string | null;
}

export function useVoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
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

  const stopRecording = useCallback((conversationId?: string): Promise<RecordingResult> => {
    return new Promise((resolve, reject) => {
      const mediaRecorder = mediaRecorderRef.current;
      if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        reject(new Error('No active recording'));
        return;
      }

      mediaRecorder.onstop = async () => {
        setIsRecording(false);
        setIsProcessing(true);

        try {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const timestamp = new Date().toISOString();
          
          // Parallelize transcription and upload (independent operations)
          const transcribeFormData = new FormData();
          transcribeFormData.append('audio', audioBlob, 'recording.webm');
          
          const uploadFormData = new FormData();
          uploadFormData.append('audio', audioBlob, 'recording.webm');
          uploadFormData.append('conversationId', conversationId || 'unknown');
          uploadFormData.append('role', 'student');
          uploadFormData.append('timestamp', timestamp);
          
          const [transcribeResult, uploadResult] = await Promise.all([
            // Transcribe audio
            apiRequest('POST', '/api/transcribe', transcribeFormData)
              .then(res => res.json()),
            
            // Upload audio to storage
            apiRequest('POST', '/api/audio/upload', uploadFormData)
              .then(res => res.json())
              .catch(uploadError => {
                console.error('Failed to upload audio:', uploadError);
                return { audioUrl: null }; // Continue even if upload fails
              })
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

  const toggleRecording = useCallback(async (conversationId?: string): Promise<RecordingResult | null> => {
    if (isRecording) {
      return await stopRecording(conversationId);
    } else {
      await startRecording();
      return null;
    }
  }, [isRecording, startRecording, stopRecording]);

  return {
    isRecording,
    isProcessing,
    startRecording,
    stopRecording,
    toggleRecording,
  };
}
