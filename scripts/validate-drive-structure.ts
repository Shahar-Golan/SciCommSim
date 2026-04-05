import "dotenv/config";
import path from "path";
import { google } from "googleapis";

type DriveFile = {
  id?: string | null;
  name?: string | null;
  mimeType?: string | null;
};

type StructureCounters = {
  folders: number;
  docs: number;
  files: number;
  conv1Docs: number;
  conv2Docs: number;
  nonDialogicDocs: number;
};

function normalizeDriveFolderId(input: string): string {
  const match = input.match(/folders\/([a-zA-Z0-9_-]+)/);
  return match?.[1] || input;
}

function createDriveClient() {
  const keyFilePath = process.env.RENDER
    ? "/etc/secrets/google-credentials.json"
    : "./google-credentials.json";

  const auth = new google.auth.GoogleAuth({
    keyFile: keyFilePath,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });

  return google.drive({ version: "v3", auth });
}

async function listChildren(drive: ReturnType<typeof google.drive>, folderId: string): Promise<DriveFile[]> {
  const files: DriveFile[] = [];
  let pageToken: string | undefined = undefined;

  do {
    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: "nextPageToken, files(id,name,mimeType)",
      pageToken,
      pageSize: 1000,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    files.push(...(response.data.files || []));
    pageToken = response.data.nextPageToken || undefined;
  } while (pageToken);

  return files;
}

async function printTree(
  drive: ReturnType<typeof google.drive>,
  folderId: string,
  depth = 0,
  counters: StructureCounters = {
    folders: 0,
    docs: 0,
    files: 0,
    conv1Docs: 0,
    conv2Docs: 0,
    nonDialogicDocs: 0,
  },
): Promise<void> {
  const children = await listChildren(drive, folderId);

  const sorted = [...children].sort((a, b) => {
    const aFolder = a.mimeType === "application/vnd.google-apps.folder" ? 0 : 1;
    const bFolder = b.mimeType === "application/vnd.google-apps.folder" ? 0 : 1;
    if (aFolder !== bFolder) {
      return aFolder - bFolder;
    }

    return (a.name || "").localeCompare(b.name || "");
  });

  for (const item of sorted) {
    counters.files += 1;
    const indent = "  ".repeat(depth);

    if (item.mimeType === "application/vnd.google-apps.folder") {
      counters.folders += 1;
      console.log(`${indent}[FOLDER] ${item.name} (${item.id})`);
      if (item.id) {
        await printTree(drive, item.id, depth + 1, counters);
      }
      continue;
    }

    if (item.mimeType === "application/vnd.google-apps.document") {
      counters.docs += 1;
      const lowerName = (item.name || "").toLowerCase();
      const isConv1 = /\bconv\s*[_-]?1\b/.test(lowerName);
      const isConv2 = /\bconv\s*[_-]?2\b/.test(lowerName);

      if (isConv1) {
        counters.conv1Docs += 1;
      } else if (isConv2) {
        counters.conv2Docs += 1;
      } else {
        counters.nonDialogicDocs += 1;
      }

      const tag = isConv1 ? " [conv1]" : isConv2 ? " [conv2]" : " [other]";
      console.log(`${indent}[DOC${tag}] ${item.name} (${item.id})`);
      continue;
    }

    console.log(`${indent}[FILE] ${item.name} (${item.mimeType}) (${item.id})`);
  }

  if (depth === 0) {
    console.log("\nSummary:");
    console.log(`Folders: ${counters.folders}`);
    console.log(`Google Docs: ${counters.docs}`);
    console.log(`conv1 docs: ${counters.conv1Docs}`);
    console.log(`conv2 docs: ${counters.conv2Docs}`);
    console.log(`non-dialogic docs: ${counters.nonDialogicDocs}`);
    console.log(`Total items: ${counters.files}`);
    console.log("\nDialogic eligibility rule:");
    console.log("Only files tagged as [conv1] or [conv2] should enable the Start Dialogic Feedback action.");
  }
}

async function main() {
  const folderInput = process.env.GOOGLE_DRIVE_FOLDER_ID || "1gW14om5G13M9dlXbUbTrI9XU_UoRaQtH";
  const folderId = normalizeDriveFolderId(folderInput);
  const drive = createDriveClient();

  const folderInfo = await drive.files.get({
    fileId: folderId,
    fields: "id,name,mimeType",
    supportsAllDrives: true,
  });

  console.log(`Root folder: ${folderInfo.data.name} (${folderInfo.data.id})`);
  console.log("Tree:");
  await printTree(drive, folderId);
}

main().catch((error) => {
  console.error("Failed to validate Drive structure:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
