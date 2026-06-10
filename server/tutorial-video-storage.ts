import {
  BlobServiceClient,
  BlobSASPermissions,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  type ContainerClient,
} from "@azure/storage-blob";
import fs from "fs/promises";
import path from "path";
import { storage } from "./storage";

type TutorialVideoDefinition = {
  key: "default" | "group-c";
  localPath: string;
  blobName: string;
  contentType: string;
};

type ParsedAzureConnectionString = {
  accountName: string;
  accountKey: string;
};

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const containerName = process.env.AZURE_TUTORIAL_VIDEOS_CONTAINER || "videos";

const tutorialVideos: TutorialVideoDefinition[] = [
  {
    key: "default",
    localPath: path.resolve(process.cwd(), "test", "SciCom Tutorial 1.mp4"),
    blobName: "tutorials/scicom-tutorial-1.mp4",
    contentType: "video/mp4",
  },
  {
    key: "group-c",
    localPath: path.resolve(process.cwd(), "test", "SciCom Tutorial - Group C.mp4"),
    blobName: "tutorials/scicom-tutorial-group-c.mp4",
    contentType: "video/mp4",
  },
];

function parseAzureConnectionString(value: string): ParsedAzureConnectionString | null {
  const parts = Object.fromEntries(
    value
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separatorIndex = part.indexOf("=");
        if (separatorIndex < 0) {
          return ["", ""];
        }

        return [part.slice(0, separatorIndex), part.slice(separatorIndex + 1)];
      }),
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
    console.warn("AZURE_STORAGE_CONNECTION_STRING is not set. Tutorial videos will not upload.");
    return null;
  }

  try {
    return BlobServiceClient.fromConnectionString(connectionString).getContainerClient(containerName);
  } catch (error) {
    console.error("Failed to initialize tutorial video container client:", error);
    return null;
  }
}

const parsedConnectionString = connectionString ? parseAzureConnectionString(connectionString) : null;
const storageCredential = parsedConnectionString
  ? new StorageSharedKeyCredential(parsedConnectionString.accountName, parsedConnectionString.accountKey)
  : null;

const containerClient = createContainerClient();

function getSignedBlobUrl(blobName: string): string {
  if (!containerClient) {
    throw new Error("Tutorial video container client is not initialized");
  }

  const blobClient = containerClient.getBlockBlobClient(blobName);

  if (!storageCredential) {
    return blobClient.url;
  }

  const expiry = new Date();
  expiry.setFullYear(expiry.getFullYear() + 5);

  const sasToken = generateBlobSASQueryParameters(
    {
      containerName,
      blobName,
      permissions: BlobSASPermissions.parse("r"),
      startsOn: new Date(Date.now() - 5 * 60 * 1000),
      expiresOn: expiry,
    },
    storageCredential,
  ).toString();

  return `${blobClient.url}?${sasToken}`;
}

export async function initializeTutorialVideos(): Promise<void> {
  if (!containerClient) {
    return;
  }

  try {
    await containerClient.createIfNotExists();
  } catch (error) {
    console.error("Failed to initialize tutorial videos container:", error);
    return;
  }

  for (const definition of tutorialVideos) {
    const existing = await storage.getTutorialVideoByKey(definition.key);
    if (existing?.videoUrl) {
      continue;
    }

    try {
      const buffer = await fs.readFile(definition.localPath);
      const blobClient = containerClient.getBlockBlobClient(definition.blobName);

      await blobClient.uploadData(buffer, {
        blobHTTPHeaders: {
          blobContentType: definition.contentType,
          blobCacheControl: "public, max-age=86400",
        },
      });

      await storage.upsertTutorialVideo({
        key: definition.key,
        blobName: definition.blobName,
        videoUrl: getSignedBlobUrl(definition.blobName),
      });

      console.log(`Tutorial video '${definition.key}' uploaded to Azure Blob Storage.`);
    } catch (error) {
      console.error(`Failed to upload tutorial video '${definition.key}':`, error);
    }
  }
}

export function selectTutorialVideoKey(counter: number): "default" | "group-c" {
  return counter % 3 === 2 ? "group-c" : "default";
}
