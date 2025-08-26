import { apiRequest } from './queryClient';

export async function synthesizeSpeech(text: string): Promise<string> {
  try {
    const response = await apiRequest('POST', '/api/synthesize', { text });
    const audioBlob = await response.blob();
    return URL.createObjectURL(audioBlob);
  } catch (error) {
    console.error('Error synthesizing speech:', error);
    throw new Error('Failed to generate speech');
  }
}

export async function playAudio(audioUrl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const audio = new Audio(audioUrl);
    audio.onended = () => resolve();
    audio.onerror = () => reject(new Error('Failed to play audio'));
    audio.play().catch(reject);
  });
}

export function stopAudio(audioUrl: string) {
  const audio = document.querySelector(`audio[src="${audioUrl}"]`) as HTMLAudioElement;
  if (audio) {
    audio.pause();
    audio.currentTime = 0;
  }
}
