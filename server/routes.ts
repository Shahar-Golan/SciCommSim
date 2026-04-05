import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertStudentSchema, insertTrainingSessionSchema, insertConversationSchema } from "@shared/schema";
import { transcribeAudio, generateSpeech, initializeDefaultPrompts } from "./openai";
import { generateLaypersonResponse } from "./openai-chat";
import { generateFeedback, generateTeacherResponse, evaluateNextMove, buildTakeawaySummary } from "./openai-feedback";
import { uploadAudio, initializeAudioBucket } from "./audio-storage";
import { runProsodyStep2ForConversation } from "./prosody-step2";
import { runProsodyStep3ForConversation } from "./prosody-step3";
import { runProsodyPipelineForConversation } from "./prosody-pipeline";
import { hashPassword, verifyPassword } from "./password-utils";
import { sendApprovalEmail, sendAccessRequestNotificationToAdmin } from "./approval-email";
import { google } from "googleapis";
import path from "path";
import multer from "multer";
import { z } from "zod";

const upload = multer({ storage: multer.memoryStorage() });

function normalizeDriveFolderId(input: string): string {
  const match = input.match(/folders\/([a-zA-Z0-9_-]+)/);
  return match?.[1] || input;
}

function buildDriveFolderCandidates(input: string | undefined): string[] {
  const fromEnv = (input || "")
    .split(",")
    .map((item) => normalizeDriveFolderId(item.trim()))
    .filter(Boolean);

  const defaults = [
    "1gW14om5G13M9dlXbUbTrI9XU_UoRaQtH", // New mission folder
    "1Ed-P__AoqI5ZK3l2WR10Bwa1ljULaXw0", // Previous working folder
  ];

  const seen = new Set<string>();
  const candidates: string[] = [];

  for (const id of [...fromEnv, ...defaults]) {
    if (!seen.has(id)) {
      seen.add(id);
      candidates.push(id);
    }
  }

  return candidates;
}

async function resolveAccessibleDriveFolder(drive: any, candidates: string[]): Promise<string> {
  for (const folderId of candidates) {
    try {
      await drive.files.get({
        fileId: folderId,
        fields: "id,name",
        supportsAllDrives: true,
      });
      return folderId;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("File not found")) {
        throw error;
      }
    }
  }

  throw new Error(`No accessible Drive folder found in candidates: ${candidates.join(", ")}`);
}

function createGoogleClients() {
  const keyFilePath = process.env.RENDER
    ? "/etc/secrets/google-credentials.json"
    : "./google-credentials.json";

  const auth = new google.auth.GoogleAuth({
    keyFile: keyFilePath,
    scopes: [
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/documents.readonly",
    ],
  });

  const drive = google.drive({ version: "v3", auth });
  const docs = google.docs({ version: "v1", auth });
  return { drive, docs };
}

type TranscriptListItem = {
  id: string;
  name: string;
  modifiedTime?: string;
  webViewLink?: string;
  folderPath: string;
  sessionFolder: string;
  studentNumber?: number;
  conversationTag?: "conv1" | "conv2";
  isDialogicEligible: boolean;
};

type TranscriptFolderGroup = {
  folderName: string;
  transcripts: TranscriptListItem[];
};

function extractStudentNumber(fileName: string): number | undefined {
  const match = fileName.match(/student_(\d+)_/i);
  if (!match) {
    return undefined;
  }

  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
}

function extractConversationTag(fileName: string): "conv1" | "conv2" | undefined {
  const normalized = fileName.toLowerCase();
  if (/\bconv\s*[_-]?1\b/.test(normalized)) {
    return "conv1";
  }

  if (/\bconv\s*[_-]?2\b/.test(normalized)) {
    return "conv2";
  }

  return undefined;
}

function isDialogicEligibleTranscriptName(fileName: string): boolean {
  return Boolean(extractConversationTag(fileName));
}

async function listFolderChildren(drive: any, folderId: string) {
  const files: any[] = [];
  let pageToken: string | undefined;

  do {
    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: "nextPageToken, files(id,name,mimeType,modifiedTime,webViewLink)",
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

async function collectDocsRecursively(
  drive: any,
  folderId: string,
  folderPath: string,
  acc: TranscriptListItem[],
): Promise<void> {
  const children = await listFolderChildren(drive, folderId);

  for (const item of children) {
    if (!item.id || !item.name) {
      continue;
    }

    if (item.mimeType === "application/vnd.google-apps.folder") {
      const nextPath = folderPath ? `${folderPath}/${item.name}` : item.name;
      await collectDocsRecursively(drive, item.id, nextPath, acc);
      continue;
    }

    if (item.mimeType === "application/vnd.google-apps.document") {
      const conversationTag = extractConversationTag(item.name);
      const sessionFolder = folderPath || "Root";
      acc.push({
        id: item.id,
        name: item.name,
        modifiedTime: item.modifiedTime || undefined,
        webViewLink: item.webViewLink || undefined,
        folderPath,
        sessionFolder,
        studentNumber: extractStudentNumber(item.name),
        conversationTag,
        isDialogicEligible: Boolean(conversationTag),
      });
    }
  }
}

function extractDocText(content: Array<any> | undefined): string {
  if (!content) {
    return "";
  }

  const chunks: string[] = [];
  for (const element of content) {
    const paragraphElements = element?.paragraph?.elements;
    if (!paragraphElements) {
      continue;
    }

    for (const part of paragraphElements) {
      const text = part?.textRun?.content;
      if (typeof text === "string") {
        chunks.push(text);
      }
    }
  }

  return chunks.join("").trim();
}

const testFeedbackAccessRequestSchema = z.object({
  username: z.string().trim().min(3).max(64),
  email: z.string().trim().email().max(320),
  password: z.string().min(8).max(128),
});

const testFeedbackLoginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

type FeedbackQueueItem = {
  priority: number;
  type: "improvement" | "strength";
  concept: string;
  target_quote: string;
  issue_description: string;
};

type FeedbackPlannerState = {
  feedback_queue: FeedbackQueueItem[];
  initial_feedback_queue: FeedbackQueueItem[];
  queue_cursor: number;
  socratic_attempts: number;
  takeaway_sent: boolean;
};

function parseFeedbackPlannerState(summary: string | null): FeedbackPlannerState {
  if (!summary) {
    return {
      feedback_queue: [],
      initial_feedback_queue: [],
      queue_cursor: 0,
      socratic_attempts: 0,
      takeaway_sent: false,
    };
  }

  try {
    const parsed = JSON.parse(summary);
    return {
      feedback_queue: Array.isArray(parsed.feedback_queue) ? (parsed.feedback_queue as FeedbackQueueItem[]) : [],
      initial_feedback_queue: Array.isArray(parsed.initial_feedback_queue) ? (parsed.initial_feedback_queue as FeedbackQueueItem[]) : [],
      queue_cursor: typeof parsed.queue_cursor === "number" ? parsed.queue_cursor : 0,
      socratic_attempts: typeof parsed.socratic_attempts === "number" ? parsed.socratic_attempts : 0,
      takeaway_sent: Boolean(parsed.takeaway_sent),
    };
  } catch {
    return {
      feedback_queue: [],
      initial_feedback_queue: [],
      queue_cursor: 0,
      socratic_attempts: 0,
      takeaway_sent: false,
    };
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Initialize default AI prompts
  await initializeDefaultPrompts();

  // Initialize audio storage bucket
  await initializeAudioBucket();

  // Student registration
  app.post("/api/students", async (req, res) => {
    try {
      const studentData = insertStudentSchema.parse(req.body);
      const student = await storage.createStudent(studentData);
      res.json(student);
    } catch (error) {
      console.error("Error creating student:", error);
      res.status(400).json({ message: "Invalid student data" });
    }
  });

  // Request access for Test feedback area (pending until admin approves by email link)
  app.post("/api/test-feedback/access-requests", async (req, res) => {
    try {
      const parsed = testFeedbackAccessRequestSchema.parse(req.body);

      const request = await storage.createTestFeedbackAccessRequest({
        username: parsed.username,
        email: parsed.email,
        passwordHash: hashPassword(parsed.password),
      });

      const adminEmailSent = await sendAccessRequestNotificationToAdmin({
        requestId: request.id,
        username: parsed.username,
        requesterEmail: parsed.email,
      });

      res.status(201).json({
        message: adminEmailSent
          ? "Request submitted. Admin has been notified by email."
          : "Request submitted, but admin email notification failed.",
        adminEmailSent,
      });
    } catch (error) {
      console.error("Failed to create test feedback access request:", error instanceof Error ? error.message : String(error));
      res.status(400).json({ message: "Failed to submit access request." });
    }
  });

  // Login gate for Test feedback area (only approved users)
  app.post("/api/test-feedback/login", async (req, res) => {
    try {
      const parsed = testFeedbackLoginSchema.parse(req.body);
      const user = await storage.getTestFeedbackAccessUserByUsername(parsed.username);

      if (!user || !verifyPassword(parsed.password, user.passwordHash)) {
        return res.status(401).json({ message: "Invalid username or password." });
      }

      res.json({ success: true, username: user.username });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Test feedback login failed:", message);

      if (message.includes('relation "test_feedback_access_users" does not exist')) {
        return res.status(503).json({ message: "Test feedback access is not initialized yet." });
      }

      res.status(400).json({ message: "Login failed." });
    }
  });

  // Mission 2: list Google Docs transcripts from a specific Drive folder (approved users only)
  app.get("/api/test-feedback/transcripts", async (req, res) => {
    try {
      const username = String(req.headers["x-test-feedback-username"] || "").trim();
      if (!username) {
        return res.status(401).json({ message: "Missing approved user context." });
      }

      const approvedUser = await storage.getTestFeedbackAccessUserByUsername(username);
      if (!approvedUser) {
        return res.status(403).json({ message: "User is not approved for test feedback access." });
      }

      const folderCandidates = buildDriveFolderCandidates(process.env.GOOGLE_DRIVE_FOLDER_ID);
      const { drive } = createGoogleClients();

      const folderId = await resolveAccessibleDriveFolder(drive, folderCandidates);

      const transcripts: TranscriptListItem[] = [];
      await collectDocsRecursively(drive, folderId, "", transcripts);

      transcripts.sort((a, b) => {
        const folderCompare = a.sessionFolder.localeCompare(b.sessionFolder);
        if (folderCompare !== 0) {
          return folderCompare;
        }

        if (a.conversationTag && b.conversationTag && a.conversationTag !== b.conversationTag) {
          return a.conversationTag.localeCompare(b.conversationTag);
        }

        if (a.conversationTag && !b.conversationTag) {
          return -1;
        }

        if (!a.conversationTag && b.conversationTag) {
          return 1;
        }

        const aStudent = a.studentNumber ?? Number.MAX_SAFE_INTEGER;
        const bStudent = b.studentNumber ?? Number.MAX_SAFE_INTEGER;
        if (aStudent !== bStudent) {
          return aStudent - bStudent;
        }

        return a.name.localeCompare(b.name);
      });

      const folderMap = new Map<string, TranscriptListItem[]>();
      for (const transcript of transcripts) {
        const existing = folderMap.get(transcript.sessionFolder) || [];
        existing.push(transcript);
        folderMap.set(transcript.sessionFolder, existing);
      }

      const folders: TranscriptFolderGroup[] = Array.from(folderMap.entries()).map(([folderName, folderTranscripts]) => ({
        folderName,
        transcripts: folderTranscripts,
      }));

      res.json({ transcripts, folders });
    } catch (error) {
      console.error("Failed to list Google Docs transcripts:", error instanceof Error ? error.message : String(error));
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("File not found") || message.includes("No accessible Drive folder found")) {
        return res.status(404).json({
          message: "Drive folder not found for this service account. Share the target folder with drive-reader@scicommsim.iam.gserviceaccount.com or set GOOGLE_DRIVE_FOLDER_ID to an accessible folder id.",
        });
      }

      res.status(500).json({ message: "Failed to list transcripts from Google Drive." });
    }
  });

  // Mission 2: read a single Google Doc transcript (approved users only)
  app.get("/api/test-feedback/transcripts/:docId", async (req, res) => {
    try {
      const username = String(req.headers["x-test-feedback-username"] || "").trim();
      if (!username) {
        return res.status(401).json({ message: "Missing approved user context." });
      }

      const approvedUser = await storage.getTestFeedbackAccessUserByUsername(username);
      if (!approvedUser) {
        return res.status(403).json({ message: "User is not approved for test feedback access." });
      }

      const { docId } = req.params;
      const { docs, drive } = createGoogleClients();

      const [docResponse, fileResponse] = await Promise.all([
        docs.documents.get({ documentId: docId }),
        drive.files.get({ fileId: docId, fields: "webViewLink" }),
      ]);

      const title = docResponse.data.title || "Untitled Transcript";
      const content = extractDocText(docResponse.data.body?.content as Array<any> | undefined);
      const webViewLink = fileResponse.data.webViewLink || null;

      res.json({
        id: docId,
        title,
        content,
        webViewLink,
      });
    } catch (error) {
      console.error("Failed to read Google Doc transcript:", error instanceof Error ? error.message : String(error));
      res.status(500).json({ message: "Failed to read transcript document." });
    }
  });

  // Mission 4: Generate feedback from test transcript (approved users only)
  app.post("/api/test-feedback/generate-feedback", async (req, res) => {
    try {
      const username = String(req.headers["x-test-feedback-username"] || "").trim();
      if (!username) {
        return res.status(401).json({ message: "Missing approved user context." });
      }

      const approvedUser = await storage.getTestFeedbackAccessUserByUsername(username);
      if (!approvedUser) {
        return res.status(403).json({ message: "User is not approved for test feedback access." });
      }

      const { transcriptContent, transcriptName } = req.body;
      if (!transcriptContent || typeof transcriptContent !== "string") {
        return res.status(400).json({ message: "transcriptContent is required and must be a string" });
      }

      if (!transcriptName || typeof transcriptName !== "string") {
        return res.status(400).json({ message: "transcriptName is required and must be a string" });
      }

      if (!isDialogicEligibleTranscriptName(transcriptName)) {
        return res.status(400).json({
          message: "Dialogic feedback can be started only for conv1 or conv2 transcripts.",
        });
      }

      // Parse transcript text into messages
      // Format: "Ayelet: message\nstudent: message\n..."
      const lines = transcriptContent.split(/\r?\n/).filter(line => line.trim());
      const messages: Array<{ role: 'student' | 'ai'; content: string; timestamp: string }> = [];

      for (const line of lines) {
        const match = line.match(/^(\s*)(Ayelet|student)(\s*:\s*)(.*)$/i);
        if (match) {
          const [, , speaker, , content] = match;
          const role = speaker.toLowerCase() === 'ayelet' ? 'ai' : 'student';
          const timestamp = new Date().toISOString();
          
          if (content.trim()) {
            messages.push({ role, content: content.trim(), timestamp });
          }
        }
      }

      if (messages.length === 0) {
        return res.status(400).json({ message: "No student or Ayelet messages found in transcript" });
      }

      console.log("Generating feedback for", messages.length, "messages");
      const feedbackData = await generateFeedback(messages);

      res.json({
        feedbackQueue: feedbackData.feedback_queue,
        strengths: feedbackData.strengths,
        improvements: feedbackData.improvements,
        messageCount: messages.length,
        conversationTag: extractConversationTag(transcriptName),
      });
    } catch (error) {
      console.error("Test feedback generation error:", error instanceof Error ? error.message : String(error));
      res.status(500).json({ message: "Failed to generate feedback from transcript" });
    }
  });

  // Start immediate dialogic flow by creating a real conversation from selected transcript.
  app.post("/api/test-feedback/start-dialogue", async (req, res) => {
    try {
      const username = String(req.headers["x-test-feedback-username"] || "").trim();
      if (!username) {
        return res.status(401).json({ message: "Missing approved user context." });
      }

      const approvedUser = await storage.getTestFeedbackAccessUserByUsername(username);
      if (!approvedUser) {
        return res.status(403).json({ message: "User is not approved for test feedback access." });
      }

      const { transcriptContent, transcriptName } = req.body;
      if (!transcriptContent || typeof transcriptContent !== "string") {
        return res.status(400).json({ message: "transcriptContent is required and must be a string" });
      }

      if (!transcriptName || typeof transcriptName !== "string") {
        return res.status(400).json({ message: "transcriptName is required and must be a string" });
      }

      if (!isDialogicEligibleTranscriptName(transcriptName)) {
        return res.status(400).json({
          message: "Dialogic feedback can be started only for conv1 or conv2 transcripts.",
        });
      }

      const lines = transcriptContent.split(/\r?\n/).filter((line) => line.trim());
      const messages: Array<{ role: "student" | "ai"; content: string; timestamp: string }> = [];

      for (const line of lines) {
        const match = line.match(/^(\s*)(Ayelet|student)(\s*:\s*)(.*)$/i);
        if (!match) {
          continue;
        }

        const [, , speaker, , content] = match;
        const role = speaker.toLowerCase() === "ayelet" ? "ai" : "student";
        if (!content.trim()) {
          continue;
        }

        messages.push({
          role,
          content: content.trim(),
          timestamp: new Date().toISOString(),
        });
      }

      if (messages.length === 0) {
        return res.status(400).json({ message: "No student or Ayelet messages found in transcript" });
      }

      const testStudent = await storage.createStudent({
        name: `Test Feedback - ${username}`,
      });

      const session = await storage.createTrainingSession({
        studentId: testStudent.id,
      });

      const conversationTag = extractConversationTag(transcriptName);
      const conversationNumber = conversationTag === "conv2" ? 2 : 1;

      const conversation = await storage.createConversation({
        sessionId: session.id,
        conversationNumber,
        transcript: messages,
      });

      res.json({
        conversationId: conversation.id,
        conversationNumber,
        messageCount: messages.length,
      });
    } catch (error) {
      console.error("Test feedback dialogue bootstrap failed:", error instanceof Error ? error.message : String(error));
      res.status(500).json({ message: "Failed to start dialogic feedback" });
    }
  });

  // Training session management
  app.post("/api/training-sessions", async (req, res) => {
    try {
      const sessionData = insertTrainingSessionSchema.parse(req.body);
      const session = await storage.createTrainingSession(sessionData);
      res.json(session);
    } catch (error) {
      console.error("Error creating training session:", error);
      res.status(400).json({ message: "Invalid session data" });
    }
  });

  app.patch("/api/training-sessions/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      
      const session = await storage.updateTrainingSession(id, updates);
      res.json(session);
    } catch (error) {
      console.error("Error updating training session:", error);
      res.status(400).json({ message: "Failed to update session" });
    }
  });

  app.get("/api/training-sessions/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const session = await storage.getTrainingSession(id);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      res.json(session);
    } catch (error) {
      console.error("Error fetching training session:", error);
      res.status(500).json({ message: "Failed to fetch session" });
    }
  });

  app.get("/api/training-sessions/:id/summary", async (req, res) => {
    try {
      const { id } = req.params;
      const sessionSummary = await storage.getSessionSummary(id);
      if (!sessionSummary) {
        return res.status(404).json({ message: "Session not found" });
      }
      res.json(sessionSummary);
    } catch (error) {
      console.error("Error fetching session summary:", error);
      res.status(500).json({ message: "Failed to fetch session summary" });
    }
  });

  // Conversation management
  app.post("/api/conversations", async (req, res) => {
    try {
      const conversationData = insertConversationSchema.parse(req.body);
      const conversation = await storage.createConversation(conversationData);
      res.json(conversation);
    } catch (error) {
      console.error("Error creating conversation:", error);
      res.status(400).json({ message: "Invalid conversation data" });
    }
  });

  app.patch("/api/conversations/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const isEndingConversation = Boolean(updates?.endedAt);
      const conversation = await storage.updateConversation(id, updates);
      res.json(conversation);

      // Fire-and-forget enqueue on end: runs in parallel with subsequent text feedback generation.
      /*
      if (isEndingConversation) {
        setImmediate(async () => {
          try {
            const job = await storage.enqueueProsodyJobForConversation(id);
            if (job) {
              console.log(`[PROSODY] Enqueued job ${job.id} for conversation ${id} with ${job.totalSegments} segments`);
              await runProsodyPipelineForConversation(id);
            }
          } catch (enqueueError) {
            console.error(`[PROSODY] Failed to enqueue job for conversation ${id}:`, enqueueError);
          }
        });
      }
      */
    } catch (error) {
      console.error("Error updating conversation:", error);
      res.status(400).json({ message: "Failed to update conversation" });
    }
  });

  app.get("/api/conversations/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const conversation = await storage.getConversation(id);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      res.json(conversation);
    } catch (error) {
      console.error("Error fetching conversation:", error);
      res.status(500).json({ message: "Failed to fetch conversation" });
    }
  });

  app.get("/api/conversations/session/:sessionId", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const conversations = await storage.getConversationsBySession(sessionId);
      res.json(conversations);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ message: "Failed to fetch conversations" });
    }
  });

  // Audio transcription
  app.post("/api/transcribe", upload.single("audio"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No audio file provided" });
      }

      const transcription = await transcribeAudio(req.file.buffer);
      res.json({ text: transcription });
    } catch (error) {
      console.error("Transcription error:", error);
      res.status(500).json({ message: "Failed to transcribe audio" });
    }
  });

  // Upload audio file (student recording) and get URL
  app.post("/api/audio/upload", upload.single("audio"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No audio file provided" });
      }

      const { conversationId, role, timestamp } = req.body;

      // Upload to Supabase Storage
      const audioUrl = await uploadAudio(
        req.file.buffer,
        req.file.mimetype,
        {
          conversationId: conversationId || undefined,
          role: role || 'student',
          timestamp: timestamp || new Date().toISOString(),
        }
      );

      if (!audioUrl) {
        return res.status(500).json({ message: "Failed to upload audio" });
      }

      res.json({ audioUrl });
    } catch (error) {
      console.error("Audio upload error:", error);
      res.status(500).json({ message: "Failed to upload audio" });
    }
  });

  // Upload AI-generated audio (from TTS) and get URL
  app.post("/api/audio/upload-ai", async (req, res) => {
    const startTime = Date.now();
    try {
      const { text, conversationId, timestamp } = req.body;

      if (!text) {
        return res.status(400).json({ message: "No text provided" });
      }

      console.log(`[PERF] Starting TTS generation for ${text.length} characters...`);
      const ttsStart = Date.now();
      
      // Generate speech
      const audioBuffer = await generateSpeech(text);
      
      const ttsElapsed = Date.now() - ttsStart;
      console.log(`[PERF] TTS completed in ${ttsElapsed}ms`);
      
      const totalElapsed = Date.now() - startTime;
      console.log(`[PERF] Total audio generation: ${totalElapsed}ms - returning to client immediately`);

      // Return audio buffer immediately to client
      const audioBase64 = audioBuffer.toString('base64');
      res.json({ audioUrl: null, audioBuffer: audioBase64 });

      // Upload to Supabase Storage in background (don't await)
      const uploadStart = Date.now();
      uploadAudio(
        audioBuffer,
        'audio/mpeg',
        {
          conversationId: conversationId || undefined,
          role: 'ai',
          timestamp: timestamp || new Date().toISOString(),
        }
      )
        .then((audioUrl) => {
          const uploadElapsed = Date.now() - uploadStart;
          console.log(`[PERF] Background upload completed in ${uploadElapsed}ms`);
          
          // Update conversation with final audio URL
          if (audioUrl && conversationId) {
            storage.getConversation(conversationId)
              .then(conversation => {
                if (conversation && conversation.transcript) {
                  // Find the last AI message and update its audioUrl
                  const transcript = [...conversation.transcript];
                  for (let i = transcript.length - 1; i >= 0; i--) {
                    if (transcript[i].role === 'ai' && !transcript[i].audioUrl) {
                      transcript[i].audioUrl = audioUrl;
                      return storage.updateConversation(conversationId, { transcript });
                    }
                  }
                }
              })
              .then(() => {
                console.log(`[PERF] DB updated with audio URL`);
              })
              .catch((error) => {
                console.error('[PERF] Failed to update conversation with audio URL:', error);
              });
          }
        })
        .catch((error) => {
          console.error('[PERF] Background upload failed:', error);
        });

    } catch (error) {
      console.error("AI audio generation error:", error);
      res.status(500).json({ message: "Failed to generate AI audio" });
    }
  });

  // AI response generation
  app.post("/api/ai-response", async (req, res) => {
    const startTime = Date.now();
    try {
      const { messages } = req.body;
      console.log(`[PERF] Starting AI response generation...`);
      
      const response = await generateLaypersonResponse(messages);
      
      const elapsed = Date.now() - startTime;
      console.log(`[PERF] AI response generated in ${elapsed}ms`);
      
      res.json({ response });
    } catch (error) {
      console.error("AI response error:", error);
      res.status(500).json({ message: "Failed to generate AI response" });
    }
  });

  // Text-to-speech
  app.post("/api/synthesize", async (req, res) => {
    try {
      const { text } = req.body;
      if (!text) {
        return res.status(400).json({ message: "No text provided" });
      }

      const audioBuffer = await generateSpeech(text);
      res.set({
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.length.toString(),
      });
      res.send(audioBuffer);
    } catch (error) {
      console.error("TTS error:", error);
      res.status(500).json({ message: "Failed to synthesize speech" });
    }
  });

  // Feedback generation
  app.post("/api/feedback", async (req, res) => {
    console.log("Feedback API called with:", req.body);
    try {
      const { conversationId } = req.body;
      
      // Fetch the conversation to get the actual transcript
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      
      const messages = conversation.transcript || [];
      console.log("Generating feedback for conversation:", conversationId, "with", messages?.length, "messages");
      
      const feedbackData = await generateFeedback(messages);
      console.log("Generated feedback data:", feedbackData);
      
      const feedback = await storage.createFeedback({
        conversationId,
        strengths: feedbackData.strengths,
        improvements: feedbackData.improvements,
      });

      await storage.updateFeedback(feedback.id, {
        summary: JSON.stringify({
          feedback_queue: feedbackData.feedback_queue,
          initial_feedback_queue: feedbackData.feedback_queue,
          queue_cursor: 0,
          socratic_attempts: 0,
          takeaway_sent: false,
        }),
      });

      const savedFeedback = await storage.getFeedbackByConversation(conversationId);
      
      console.log("Saved feedback to database:", feedback);
      res.json(savedFeedback || feedback);
    } catch (error) {
      console.error("Feedback generation error:", error);
      res.status(500).json({ message: "Failed to generate feedback" });
    }
  });

  app.get("/api/feedback/conversation/:conversationId", async (req, res) => {
    try {
      const { conversationId } = req.params;
      const feedback = await storage.getFeedbackByConversation(conversationId);
      if (!feedback) {
        return res.status(404).json({ message: "Feedback not found" });
      }
      res.json(feedback);
    } catch (error) {
      console.error("Error fetching feedback:", error);
      res.status(500).json({ message: "Failed to fetch feedback" });
    }
  });

  // Prosody status (job + per-student-segment queue rows)
  app.get("/api/prosody/conversation/:conversationId/status", async (req, res) => {
    try {
      const { conversationId } = req.params;
      const [job, segments] = await Promise.all([
        storage.getProsodyJobByConversation(conversationId),
        storage.listProsodySegmentsByConversation(conversationId),
      ]);

      if (!job) {
        return res.status(404).json({ message: "Prosody job not found" });
      }

      res.json({ job, segments });
    } catch (error) {
      console.error("Error fetching prosody status:", error);
      res.status(500).json({ message: "Failed to fetch prosody status" });
    }
  });

  // Manual step 2 runner for a single conversation (download + normalize only)
  app.post("/api/prosody/conversation/:conversationId/step2-run", async (req, res) => {
    try {
      const { conversationId } = req.params;
      const result = await runProsodyStep2ForConversation(conversationId);
      res.json(result);
    } catch (error) {
      console.error("Error running prosody step 2:", error);
      res.status(500).json({
        message: "Failed to run prosody step 2",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Manual step 3 runner for a single conversation (extract numeric prosody features)
  app.post("/api/prosody/conversation/:conversationId/step3-run", async (req, res) => {
    try {
      const { conversationId } = req.params;
      const result = await runProsodyStep3ForConversation(conversationId);
      res.json(result);
    } catch (error) {
      console.error("Error running prosody step 3:", error);
      res.status(500).json({
        message: "Failed to run prosody step 3",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Feedback dialogue endpoints
  app.post("/api/feedback-dialogue/start", async (req, res) => {
    try {
      const { feedbackId } = req.body;
      
      // Get the feedback record to access strengths/improvements
      const feedback = await storage.getFeedbackByConversation(req.body.conversationId);
      if (!feedback) {
        return res.status(404).json({ message: "Feedback not found" });
      }

      // Get the original conversation transcript
      const conversation = await storage.getConversation(req.body.conversationId);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      // Clean up the conversation - extract only role and content for teacher
      const cleanConversation = (conversation.transcript || []).map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      const plannerStateAtStart = parseFeedbackPlannerState(feedback.summary || null);
      const queueAtStart = plannerStateAtStart.feedback_queue;
      const activeItemAtStart = queueAtStart[0] || null;

      // Generate initial teacher message with feedback presentation
      const initialMessage = await generateTeacherResponse(
        [],
        {
          originalConversation: cleanConversation,
        },
        {
          activeItem: activeItemAtStart,
          plannerDecision: {
            is_resolved: false,
            user_pushback_detected: false,
            next_strategy: "Ask clarifying question",
            strategy_notes: "Open with one focused Socratic question tied to the active queue item.",
          },
        }
      );
      
      // Generate greeting audio with male voice
      const audioBuffer = await generateSpeech(initialMessage, "echo");

      const teacherMessage = {
        role: 'teacher' as const,
        content: initialMessage,
        timestamp: new Date().toISOString(),
        audioUrl: undefined, // Will be updated after background upload
      };

      // Update feedback with initial dialogue transcript
      await storage.updateFeedback(feedback.id, {
        dialogueTranscript: [teacherMessage] as any,
      });

      // Return audio immediately to client
      const audioBase64 = audioBuffer.toString('base64');
      res.json({ 
        message: teacherMessage,
        audioBuffer: audioBase64,
        feedbackId: feedback.id,
      });

      // Upload audio to Supabase in background (non-blocking)
      uploadAudio(
        audioBuffer,
        'audio/mpeg',
        {
          conversationId: feedback.conversationId,
          role: 'teacher',
          timestamp: new Date().toISOString(),
        }
      )
        .then((audioUrl) => {
          if (audioUrl) {
            // Update the first teacher message with audio URL
            storage.getFeedbackByConversation(feedback.conversationId)
              .then(updatedFeedback => {
                if (updatedFeedback && updatedFeedback.dialogueTranscript && updatedFeedback.dialogueTranscript.length > 0) {
                  const transcript = [...updatedFeedback.dialogueTranscript];
                  transcript[0].audioUrl = audioUrl;
                  return storage.updateFeedback(updatedFeedback.id, { dialogueTranscript: transcript as any });
                }
              })
              .catch((error) => {
                console.error('[FEEDBACK] Failed to update teacher message with audio URL:', error);
              });
          }
        })
        .catch((error) => {
          console.error('[FEEDBACK] Background upload failed:', error);
        });
    } catch (error) {
      console.error("Failed to start feedback dialogue:", error);
      res.status(500).json({ message: "Failed to start feedback dialogue" });
    }
  });

  app.post("/api/feedback-dialogue/respond", async (req, res) => {
    try {
      const { feedbackId, message } = req.body;
      
      // Get current feedback with dialogue transcript
      const feedback = await storage.getFeedbackByConversation(req.body.conversationId);
      if (!feedback) {
        return res.status(404).json({ message: "Feedback not found" });
      }

      // Get the original conversation transcript
      const conversation = await storage.getConversation(req.body.conversationId);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      // Clean up the conversation - extract only role and content for teacher
      const cleanConversation = (conversation.transcript || []).map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      // Add student message to transcript
      const updatedTranscript = [
        ...(feedback.dialogueTranscript || []),
        message
      ];

      // Step 2 planner: evaluate latest student turn against active queue item.
      const plannerState = parseFeedbackPlannerState(feedback.summary || null);
      const currentQueue = plannerState.feedback_queue;
      const activeItem = currentQueue[0];
      let plannerDecision = null;
      let executorItem = activeItem || null;
      let nextSocraticAttempts = plannerState.socratic_attempts || 0;
      let takeawaySent = plannerState.takeaway_sent;
      let teacherResponse: string;

      if (activeItem) {
        plannerDecision = await evaluateNextMove(
          updatedTranscript.map(m => ({ role: m.role, content: m.content })),
          activeItem,
          nextSocraticAttempts
        );

        if (plannerDecision.is_resolved) {
          const nextQueue = currentQueue.slice(1);
          executorItem = nextQueue[0] || null;
          nextSocraticAttempts = 0;

          if (nextQueue.length === 0 && !takeawaySent) {
            teacherResponse = buildTakeawaySummary(plannerState.initial_feedback_queue);
            takeawaySent = true;
          } else {
            teacherResponse = await generateTeacherResponse(
              updatedTranscript.map(m => ({ role: m.role, content: m.content })),
              {
                originalConversation: cleanConversation,
              },
              {
                activeItem: executorItem,
                plannerDecision,
              }
            );
          }

          await storage.updateFeedback(feedback.id, {
            summary: JSON.stringify({
              feedback_queue: nextQueue,
              initial_feedback_queue: plannerState.initial_feedback_queue,
              queue_cursor: 0,
              socratic_attempts: nextSocraticAttempts,
              takeaway_sent: takeawaySent,
            }),
          });
        } else {
          nextSocraticAttempts = Math.min(nextSocraticAttempts + 1, 3);
          teacherResponse = await generateTeacherResponse(
            updatedTranscript.map(m => ({ role: m.role, content: m.content })),
            {
              originalConversation: cleanConversation,
            },
            {
              activeItem: executorItem,
              plannerDecision,
            }
          );

          await storage.updateFeedback(feedback.id, {
            summary: JSON.stringify({
              feedback_queue: currentQueue,
              initial_feedback_queue: plannerState.initial_feedback_queue,
              queue_cursor: 0,
              socratic_attempts: nextSocraticAttempts,
              takeaway_sent: takeawaySent,
            }),
          });
        }
      } else if (!takeawaySent) {
        teacherResponse = buildTakeawaySummary(plannerState.initial_feedback_queue);
        takeawaySent = true;

        await storage.updateFeedback(feedback.id, {
          summary: JSON.stringify({
            feedback_queue: currentQueue,
            initial_feedback_queue: plannerState.initial_feedback_queue,
            queue_cursor: 0,
            socratic_attempts: 0,
            takeaway_sent: takeawaySent,
          }),
        });
      } else {
        teacherResponse = await generateTeacherResponse(
          updatedTranscript.map(m => ({ role: m.role, content: m.content })),
          {
            originalConversation: cleanConversation,
          },
          {
            activeItem: null,
            plannerDecision: null,
          }
        );
      }

      // Generate teacher response audio with male voice
      const audioBuffer = await generateSpeech(teacherResponse, "echo");

      const teacherMessage = {
        role: 'teacher' as const,
        content: teacherResponse,
        timestamp: new Date().toISOString(),
        audioUrl: undefined, // Will be updated after background upload
      };

      // Update feedback with new messages
      await storage.updateFeedback(feedback.id, {
        dialogueTranscript: [...updatedTranscript, teacherMessage] as any,
      });

      // Return audio immediately to client
      const audioBase64 = audioBuffer.toString('base64');
      res.json({ 
        response: teacherMessage,
        audioBuffer: audioBase64,
      });

      // Upload audio to Supabase in background (non-blocking)
      const messageIndex = updatedTranscript.length; // Index of the teacher message we just added
      uploadAudio(
        audioBuffer,
        'audio/mpeg',
        {
          conversationId: feedback.conversationId,
          role: 'teacher',
          timestamp: new Date().toISOString(),
        }
      )
        .then((audioUrl) => {
          if (audioUrl) {
            // Update the teacher message with audio URL
            storage.getFeedbackByConversation(feedback.conversationId)
              .then(updatedFeedback => {
                if (updatedFeedback && updatedFeedback.dialogueTranscript && updatedFeedback.dialogueTranscript[messageIndex]) {
                  const transcript = [...updatedFeedback.dialogueTranscript];
                  transcript[messageIndex].audioUrl = audioUrl;
                  return storage.updateFeedback(updatedFeedback.id, { dialogueTranscript: transcript as any });
                }
              })
              .catch((error) => {
                console.error('[FEEDBACK] Failed to update teacher message with audio URL:', error);
              });
          }
        })
        .catch((error) => {
          console.error('[FEEDBACK] Background upload failed:', error);
        });
    } catch (error) {
      console.error("Failed to generate teacher response:", error);
      res.status(500).json({ message: "Failed to generate teacher response" });
    }
  });

  app.post("/api/feedback-dialogue/complete", async (req, res) => {
    try {
      const { feedbackId } = req.body;
      
      // Get current feedback
      const feedback = await storage.getFeedbackByConversation(req.body.conversationId);
      if (!feedback) {
        return res.status(404).json({ message: "Feedback not found" });
      }

      // Mark dialogue as completed
      await storage.updateFeedback(feedback.id, {
        dialogueCompleted: new Date(),
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Failed to complete feedback dialogue:", error);
      res.status(500).json({ message: "Failed to complete feedback dialogue" });
    }
  });

  // Admin routes
  app.get("/api/admin/sessions", async (req, res) => {
    try {
      const sessions = await storage.getAllTrainingSessions();
      res.json(sessions);
    } catch (error) {
      console.error("Error fetching sessions:", error);
      res.status(500).json({ message: "Failed to fetch sessions" });
    }
  });

  app.get("/api/admin/prompts", async (req, res) => {
    try {
      const prompts = await storage.getAllAiPrompts();
      res.json(prompts);
    } catch (error) {
      console.error("Error fetching prompts:", error);
      res.status(500).json({ message: "Failed to fetch prompts" });
    }
  });

  app.get("/api/admin/access-requests", async (_req, res) => {
    try {
      const requests = await storage.listPendingTestFeedbackAccessRequests();
      res.json(requests);
    } catch (error) {
      console.error("Error fetching access requests:", error);
      res.status(500).json({ message: "Failed to fetch access requests" });
    }
  });

  app.post("/api/admin/access-requests/:id/approve", async (req, res) => {
    try {
      const { id } = req.params;
      const approved = await storage.approveTestFeedbackAccessRequest(id);

      if (!approved) {
        return res.status(404).json({ message: "Access request not found" });
      }

      const emailSent = await sendApprovalEmail({
        to: approved.email,
        username: approved.username,
      });

      res.json({ approved, emailSent });
    } catch (error) {
      console.error("Error approving access request:", error);
      res.status(500).json({ message: "Failed to approve access request" });
    }
  });

  // Approve request directly from email link
  app.get("/api/admin/access-requests/:id/approve-from-email", async (req, res) => {
    try {
      const { id } = req.params;
      const approved = await storage.approveTestFeedbackAccessRequest(id);

      if (!approved) {
        return res.status(404).send("Access request not found.");
      }

      await sendApprovalEmail({
        to: approved.email,
        username: approved.username,
      });

      res.status(200).send("Request approved successfully. The user can now log in.");
    } catch (error) {
      console.error("Error approving request from email:", error instanceof Error ? error.message : String(error));
      res.status(500).send("Failed to approve request.");
    }
  });

  // Reject request directly from email link
  app.get("/api/admin/access-requests/:id/reject-from-email", async (req, res) => {
    try {
      const { id } = req.params;
      const rejected = await storage.rejectTestFeedbackAccessRequest(id);

      if (!rejected) {
        return res.status(404).send("Access request not found.");
      }

      res.status(200).send("Request rejected successfully.");
    } catch (error) {
      console.error("Error rejecting request from email:", error instanceof Error ? error.message : String(error));
      res.status(500).send("Failed to reject request.");
    }
  });

  app.post("/api/admin/access-requests/:id/reject", async (req, res) => {
    try {
      const { id } = req.params;
      const rejected = await storage.rejectTestFeedbackAccessRequest(id);

      if (!rejected) {
        return res.status(404).json({ message: "Access request not found" });
      }

      res.json({ rejected });
    } catch (error) {
      console.error("Error rejecting access request:", error);
      res.status(500).json({ message: "Failed to reject access request" });
    }
  });

  app.patch("/api/admin/prompts/:name", async (req, res) => {
    try {
      const { name } = req.params;
      const { prompt } = req.body;
      
      const updatedPrompt = await storage.upsertAiPrompt({ name, prompt });
      res.json(updatedPrompt);
    } catch (error) {
      console.error("Error updating prompt:", error);
      res.status(500).json({ message: "Failed to update prompt" });
    }
  });

  // Test endpoint to check audio storage status
  app.get("/api/test/audio-storage", async (req, res) => {
    try {
      const bucketStatus = await initializeAudioBucket();
      res.json({ 
        status: bucketStatus ? 'ready' : 'not-ready',
        message: bucketStatus ? 'Audio storage bucket is accessible' : 'Audio storage bucket not found'
      });
    } catch (error) {
      res.status(500).json({ 
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Ensure all unmatched API routes return JSON instead of Vite HTML.
  app.use("/api", (_req, res) => {
    res.status(404).json({ message: "API route not found" });
  });

  const httpServer = createServer(app);
  return httpServer;
}
