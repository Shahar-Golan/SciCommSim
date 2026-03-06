import { createClient } from '@supabase/supabase-js';
import { nanoid } from 'nanoid';

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('Supabase credentials not found. Audio storage will not work.');
}

export const supabase = supabaseUrl && supabaseKey 
  ? createClient(supabaseUrl, supabaseKey)
  : null;

const AUDIO_BUCKET = 'conversation-audio';

/**
 * Initialize the audio storage bucket
 * Creates the bucket if it doesn't exist
 */
export async function initializeAudioBucket() {
  if (!supabase) {
    console.warn('Supabase client not initialized');
    return false;
  }

  try {
    // Check if bucket exists
    const { data: buckets, error } = await supabase.storage.listBuckets();
    
    if (error) {
      console.error('Error listing buckets:', error);
      return false;
    }

    console.log('Available buckets:', buckets?.map(b => b.name).join(', ') || 'none');
    
    const bucketExists = buckets?.some(bucket => bucket.name === AUDIO_BUCKET);

    if (!bucketExists) {
      console.warn(`\n⚠️  Audio bucket '${AUDIO_BUCKET}' not found.`);
      console.warn('Available buckets:', buckets?.map(b => b.name).join(', ') || 'none');
      console.warn('\nPlease create it manually in Supabase Dashboard:');
      console.warn('1. Go to Storage section');
      console.warn('2. Create new bucket named "conversation-audio"');
      console.warn('3. Set as PUBLIC bucket');
      console.warn('4. Restart the server\n');
      return false;
    }

    console.log(`✅ Audio bucket '${AUDIO_BUCKET}' is ready`);
    return true;
  } catch (error) {
    console.error('Error initializing audio bucket:', error);
    return false;
  }
}

/**
 * Upload audio file to Supabase Storage
 * @param audioBuffer - The audio file buffer
 * @param contentType - MIME type (e.g., 'audio/webm', 'audio/mpeg')
 * @param metadata - Optional metadata (conversationId, role, etc.)
 * @returns The public URL of the uploaded audio or null if failed
 */
export async function uploadAudio(
  audioBuffer: Buffer,
  contentType: string,
  metadata: {
    conversationId?: string;
    role?: 'student' | 'ai';
    timestamp?: string;
  } = {}
): Promise<string | null> {
  if (!supabase) {
    console.error('Supabase client not initialized');
    return null;
  }

  try {
    // Generate unique filename
    const extension = contentType === 'audio/mpeg' ? 'mp3' : 'webm';
    const filename = `${metadata.conversationId || 'unknown'}/${metadata.role || 'audio'}_${nanoid()}_${Date.now()}.${extension}`;

    // Upload file
    const { data, error } = await supabase.storage
      .from(AUDIO_BUCKET)
      .upload(filename, audioBuffer, {
        contentType,
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      console.error('Error uploading audio:', error);
      return null;
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from(AUDIO_BUCKET)
      .getPublicUrl(filename);

    console.log(`Audio uploaded successfully: ${publicUrl}`);
    return publicUrl;
  } catch (error) {
    console.error('Error in uploadAudio:', error);
    return null;
  }
}

/**
 * Delete audio file from storage
 * @param audioUrl - The public URL of the audio to delete
 */
export async function deleteAudio(audioUrl: string): Promise<boolean> {
  if (!supabase) {
    console.error('Supabase client not initialized');
    return false;
  }

  try {
    // Extract filename from URL
    const url = new URL(audioUrl);
    const pathParts = url.pathname.split('/');
    const filename = pathParts.slice(pathParts.indexOf(AUDIO_BUCKET) + 1).join('/');

    const { error } = await supabase.storage
      .from(AUDIO_BUCKET)
      .remove([filename]);

    if (error) {
      console.error('Error deleting audio:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in deleteAudio:', error);
    return false;
  }
}

/**
 * Convert WebM audio to MP3 format
 * Note: This is a placeholder. For actual conversion, you would need:
 * 1. Install fluent-ffmpeg: npm install fluent-ffmpeg @types/fluent-ffmpeg
 * 2. Install ffmpeg binary on the server
 * 3. Use fluent-ffmpeg to convert the buffer
 * 
 * For now, we'll keep WebM format which is already compressed.
 */
export async function convertWebMToMP3(webmBuffer: Buffer): Promise<Buffer> {
  // TODO: Implement actual conversion if needed
  // For now, return original buffer
  console.warn('Audio conversion not implemented. Keeping original format.');
  return webmBuffer;
}
