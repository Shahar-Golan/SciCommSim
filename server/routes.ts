import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertStudentSchema, insertTrainingSessionSchema, insertConversationSchema } from "@shared/schema";
import { transcribeAudio, generateSpeech, generateLaypersonResponse, generateFeedback, generateTeacherResponse, initializeDefaultPrompts } from "./openai";
import { uploadAudio, initializeAudioBucket } from "./audio-storage";
import multer from "multer";
import { z } from "zod";

const upload = multer({ storage: multer.memoryStorage() });

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
      const conversation = await storage.updateConversation(id, updates);
      res.json(conversation);
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
    try {
      const { text, conversationId, timestamp } = req.body;

      if (!text) {
        return res.status(400).json({ message: "No text provided" });
      }

      // Generate speech
      const audioBuffer = await generateSpeech(text);

      // Upload to Supabase Storage
      const audioUrl = await uploadAudio(
        audioBuffer,
        'audio/mpeg',
        {
          conversationId: conversationId || undefined,
          role: 'ai',
          timestamp: timestamp || new Date().toISOString(),
        }
      );

      if (!audioUrl) {
        return res.status(500).json({ message: "Failed to upload audio" });
      }

      res.json({ audioUrl, audioBuffer: audioBuffer.toString('base64') });
    } catch (error) {
      console.error("AI audio upload error:", error);
      res.status(500).json({ message: "Failed to upload AI audio" });
    }
  });

  // AI response generation
  app.post("/api/ai-response", async (req, res) => {
    try {
      const { messages } = req.body;
      const response = await generateLaypersonResponse(messages);
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
      const { conversationId, messages } = req.body;
      console.log("Generating feedback for conversation:", conversationId, "with", messages?.length, "messages");
      
      const feedbackData = await generateFeedback(messages);
      console.log("Generated feedback data:", feedbackData);
      
      const feedback = await storage.createFeedback({
        conversationId,
        strengths: feedbackData.strengths,
        improvements: feedbackData.improvements,
      });
      
      console.log("Saved feedback to database:", feedback);
      res.json(feedback);
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

  // Feedback dialogue endpoints
  app.post("/api/feedback-dialogue/start", async (req, res) => {
    try {
      const { feedbackId } = req.body;
      
      // Get the feedback record to access strengths/improvements
      const feedback = await storage.getFeedbackByConversation(req.body.conversationId);
      if (!feedback) {
        return res.status(404).json({ message: "Feedback not found" });
      }

      // Generate initial teacher greeting
      const initialMessage = "Hello! I'd like to discuss your conversation with you. How do you feel the explanation went?";
      
      // Generate and upload greeting audio with male voice
      const audioBuffer = await generateSpeech(initialMessage, "echo");
      const audioUrl = await uploadAudio(
        audioBuffer,
        'audio/mpeg',
        {
          conversationId: feedback.conversationId,
          role: 'teacher',
          timestamp: new Date().toISOString(),
        }
      );

      const teacherMessage = {
        role: 'teacher' as const,
        content: initialMessage,
        timestamp: new Date().toISOString(),
        audioUrl: audioUrl || undefined,
      };

      // Update feedback with initial dialogue transcript
      await storage.updateFeedback(feedback.id, {
        dialogueTranscript: [teacherMessage] as any,
      });

      res.json({ 
        message: teacherMessage,
        audioBuffer: audioBuffer.toString('base64'),
        feedbackId: feedback.id,
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

      // Add student message to transcript
      const updatedTranscript = [
        ...(feedback.dialogueTranscript || []),
        message
      ];

      // Generate teacher response based on context
      const teacherResponse = await generateTeacherResponse(
        updatedTranscript.map(m => ({ role: m.role, content: m.content })),
        {
          strengths: feedback.strengths || "",
          improvements: feedback.improvements || "",
        }
      );

      // Generate and upload teacher response audio with male voice
      const audioBuffer = await generateSpeech(teacherResponse, "echo");
      const audioUrl = await uploadAudio(
        audioBuffer,
        'audio/mpeg',
        {
          conversationId: feedback.conversationId,
          role: 'teacher',
          timestamp: new Date().toISOString(),
        }
      );

      const teacherMessage = {
        role: 'teacher' as const,
        content: teacherResponse,
        timestamp: new Date().toISOString(),
        audioUrl: audioUrl || undefined,
      };

      // Update feedback with new messages
      await storage.updateFeedback(feedback.id, {
        dialogueTranscript: [...updatedTranscript, teacherMessage] as any,
      });

      res.json({ 
        response: teacherMessage,
        audioBuffer: audioBuffer.toString('base64'),
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

  const httpServer = createServer(app);
  return httpServer;
}
