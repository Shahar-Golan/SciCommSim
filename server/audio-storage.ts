import {
  BlobServiceClient,
  BlobSASPermissions,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  type ContainerClient,
} from '@azure/storage-blob';
import { nanoid } from 'nanoid';

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'conversation-audio';

type ParsedAzureConnectionString = {
  accountName: string;
  accountKey: string;
};

function parseAzureConnectionString(value: string): ParsedAzureConnectionString | null {
  const parts = Object.fromEntries(
    value
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separatorIndex = part.indexOf('=');
        if (separatorIndex < 0) {
          return ['', ''];
        }

        return [part.slice(0, separatorIndex), part.slice(separatorIndex + 1)];
      })
  ) as Record<string, string>;

  const accountName = parts.AccountName;
  const accountKey = parts.AccountKey;

  if (!accountName || !accountKey) {
    return null;
  }

  return { accountName, accountKey };
}

function createContainerClient(): ContainerClient | null {
  if (!connectionString) {
    console.warn('AZURE_STORAGE_CONNECTION_STRING is not set. Audio storage will not work.');
    return null;
  }

  try {
    return BlobServiceClient.fromConnectionString(connectionString).getContainerClient(containerName);
  } catch (error) {
    console.error('Failed to initialize Azure Blob Storage client:', error);
    return null;
  }
}

const parsedConnectionString = connectionString ? parseAzureConnectionString(connectionString) : null;
const storageCredential = parsedConnectionString
  ? new StorageSharedKeyCredential(parsedConnectionString.accountName, parsedConnectionString.accountKey)
  : null;

export const containerClient = createContainerClient();

function buildBlobName(
  metadata: {
    conversationId?: string;
    role?: 'student' | 'ai' | 'teacher';
    timestamp?: string;
  },
  contentType: string,
): string {
  const extension = contentType === 'audio/mpeg' ? 'mp3' : 'webm';
  const folder = metadata.conversationId || 'unknown';
  const role = metadata.role || 'audio';

  return `${folder}/${role}_${nanoid()}_${Date.now()}.${extension}`;
}

function getSignedBlobUrl(blobName: string): string {
  if (!containerClient) {
    throw new Error('Azure Blob container client is not initialized');
  }

  const blobClient = containerClient.getBlockBlobClient(blobName);

  if (!storageCredential) {
    console.warn('Azure storage account key not found. Returning blob URL without SAS token.');
    return blobClient.url;
  }

  const expiry = new Date();
  expiry.setFullYear(expiry.getFullYear() + 5);

  const sasToken = generateBlobSASQueryParameters(
    {
      containerName,
      blobName,
      permissions: BlobSASPermissions.parse('r'),
      startsOn: new Date(Date.now() - 5 * 60 * 1000),
      expiresOn: expiry,
    },
    storageCredential,
  ).toString();

  return `${blobClient.url}?${sasToken}`;
}

/**
 * Initialize the audio storage bucket
 * Creates the container if it doesn't exist
 */
export async function initializeAudioBucket(): Promise<boolean> {
  if (!containerClient) {
    console.warn('Azure Blob container client not initialized');
    return false;
  }

  try {
    await containerClient.createIfNotExists();
    console.log(`✅ Azure Blob container '${containerName}' is ready`);
    return true;
  } catch (error) {
    console.error('Error initializing Azure Blob container:', error);
    return false;
  }
}

/**
 * Upload audio file to Azure Blob Storage
 * @param audioBuffer - The audio file buffer
 * @param contentType - MIME type (e.g., 'audio/webm', 'audio/mpeg')
 * @param metadata - Optional metadata (conversationId, role, etc.)
 * @returns The signed URL of the uploaded audio or null if failed
 */
export async function uploadAudio(
  audioBuffer: Buffer,
  contentType: string,
  metadata: {
    conversationId?: string;
    role?: 'student' | 'ai' | 'teacher';
    timestamp?: string;
  } = {},
): Promise<string | null> {
  if (!containerClient) {
    console.error('Azure Blob container client not initialized');
    return null;
  }

  try {
    const blobName = buildBlobName(metadata, contentType);
    const blobClient = containerClient.getBlockBlobClient(blobName);

    await blobClient.uploadData(audioBuffer, {
      blobHTTPHeaders: {
        blobContentType: contentType,
        blobCacheControl: '3600',
      },
      metadata: metadata.timestamp ? { timestamp: metadata.timestamp } : undefined,
    });

    const audioUrl = getSignedBlobUrl(blobName);
    console.log(`Audio uploaded successfully: ${audioUrl}`);
    return audioUrl;
  } catch (error) {
    console.error('Error in uploadAudio:', error);
    return null;
  }
}

/**
 * Delete audio file from storage
 * @param audioUrl - The signed or public URL of the audio to delete
 */
export async function deleteAudio(audioUrl: string): Promise<boolean> {
  if (!containerClient) {
    console.error('Azure Blob container client not initialized');
    return false;
  }

  try {
    const url = new URL(audioUrl);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const containerIndex = pathParts.indexOf(containerName);
    const filename = containerIndex >= 0
      ? decodeURIComponent(pathParts.slice(containerIndex + 1).join('/'))
      : decodeURIComponent(pathParts.join('/'));

    const blobClient = containerClient.getBlockBlobClient(filename);
    await blobClient.deleteIfExists();
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
