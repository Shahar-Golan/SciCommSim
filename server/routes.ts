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
import multer from "multer";
import { z } from "zod";

const upload = multer({ storage: multer.memoryStorage() });

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
