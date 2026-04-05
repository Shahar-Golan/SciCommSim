import "dotenv/config";
import path from "path";
import { google } from "googleapis";

type DriveFile = {
  id?: string | null;
  name?: string | null;
  mimeType?: string | null;
};

function normalizeDriveFolderId(input: string): string {
  const match = input.match(/folders\/([a-zA-Z0-9_-]+)/);
  return match?.[1] || input;
}

function createDriveClient() {
  const credentialsFile = process.env.GOOGLE_CREDENTIALS_FILE || "google-credentials.json";
  const resolvedCredentialsPath = path.resolve(process.cwd(), credentialsFile);

  const auth = new google.auth.GoogleAuth({
    keyFile: resolvedCredentialsPath,
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
  counters = { folders: 0, docs: 0, files: 0 },
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
      console.log(`${indent}[DOC] ${item.name} (${item.id})`);
      continue;
    }

    console.log(`${indent}[FILE] ${item.name} (${item.mimeType}) (${item.id})`);
  }

  if (depth === 0) {
    console.log("\nSummary:");
    console.log(`Folders: ${counters.folders}`);
    console.log(`Google Docs: ${counters.docs}`);
    console.log(`Total items: ${counters.files}`);
  }
}

async function main() {
  const folderInput = process.env.GOOGLE_DRIVE_FOLDER_ID || "1Ed-P__AoqI5ZK3l2WR10Bwa1ljULaXw0";
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
