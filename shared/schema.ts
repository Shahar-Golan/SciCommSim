import { sql } from "drizzle-orm";
import { 
  pgTable, 
  text, 
  varchar, 
  timestamp, 
  integer, 
  jsonb, 
  uuid,
  decimal
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Students table
export const students = pgTable("students", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Training sessions
export const trainingSessions = pgTable("training_sessions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  studentId: uuid("student_id").references(() => students.id).notNull(),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  helpfulnessRating: integer("helpfulness_rating"), // 1-5
  experienceFeedback: text("experience_feedback"),
});

// Conversations within sessions
export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: uuid("session_id").references(() => trainingSessions.id).notNull(),
  conversationNumber: integer("conversation_number").notNull(), // 1 or 2
  startedAt: timestamp("started_at").defaultNow(),
  endedAt: timestamp("ended_at"),
  transcript: jsonb("transcript").$type<Array<{
    role: 'student' | 'ai';
    content: string;
    timestamp: string;
    audioUrl?: string;
  }>>().default([]),
  duration: integer("duration"), // seconds
});

// Feedback for each conversation
export const feedback = pgTable("feedback", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: uuid("conversation_id").references(() => conversations.id).notNull(),
  strengths: text("strengths"),
  improvements: text("improvements"),
  summary: text("summary"),
  dialogueTranscript: jsonb("dialogue_transcript").$type<Array<{
    role: 'student' | 'teacher';
    content: string;
    timestamp: string;
    audioUrl?: string;
  }>>().default([]),
  dialogueCompleted: timestamp("dialogue_completed"),
  createdAt: timestamp("created_at").defaultNow(),
});

// AI prompts configuration
export const aiPrompts = pgTable("ai_prompts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").unique().notNull(),
  prompt: text("prompt").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Prosody async jobs per conversation
export const prosodyJobs = pgTable("prosody_jobs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: uuid("conversation_id").references(() => conversations.id).notNull().unique(),
  status: varchar("status").notNull().default("pending"), // pending | running | completed | failed
  totalSegments: integer("total_segments").notNull().default(0),
  processedSegments: integer("processed_segments").notNull().default(0),
  error: text("error"),
  enqueuedAt: timestamp("enqueued_at").defaultNow(),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Per-student-turn prosody metrics (one row per student speech segment/audio file)
export const prosodySegmentMetrics = pgTable("prosody_segment_metrics", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: uuid("job_id").references(() => prosodyJobs.id).notNull(),
  conversationId: uuid("conversation_id").references(() => conversations.id).notNull(),
  feedbackId: uuid("feedback_id").references(() => feedback.id),
  segmentIndex: integer("segment_index").notNull(),
  sourceAudioUrl: text("source_audio_url").notNull(),
  sourceTimestamp: timestamp("source_timestamp"),
  status: varchar("status").notNull().default("pending"), // pending | running | completed | failed
  pitchMeanHz: decimal("pitch_mean_hz", { precision: 10, scale: 2 }),
  pitchRangeHz: decimal("pitch_range_hz", { precision: 10, scale: 2 }),
  energyVariance: decimal("energy_variance", { precision: 12, scale: 6 }),
  wordsPerMinute: decimal("words_per_minute", { precision: 10, scale: 2 }),
  longPauseCount: integer("long_pause_count"),
  pauseFreqPerMin: decimal("pause_freq_per_min", { precision: 10, scale: 2 }),
  rawMetrics: jsonb("raw_metrics").$type<Record<string, unknown>>(),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Insert schemas
export const insertStudentSchema = createInsertSchema(students).pick({
  name: true,
});

export const insertTrainingSessionSchema = createInsertSchema(trainingSessions).pick({
  studentId: true,
  helpfulnessRating: true,
  experienceFeedback: true,
});

export const insertConversationSchema = createInsertSchema(conversations).pick({
  sessionId: true,
  conversationNumber: true,
  transcript: true,
  duration: true,
});

export const insertFeedbackSchema = createInsertSchema(feedback).pick({
  conversationId: true,
  strengths: true,
  improvements: true,
  summary: true,
});

export const insertAiPromptSchema = createInsertSchema(aiPrompts).pick({
  name: true,
  prompt: true,
});

export const insertProsodyJobSchema = createInsertSchema(prosodyJobs).pick({
  conversationId: true,
  status: true,
  totalSegments: true,
  processedSegments: true,
  error: true,
});

export const insertProsodySegmentMetricSchema = createInsertSchema(prosodySegmentMetrics).pick({
  jobId: true,
  conversationId: true,
  feedbackId: true,
  segmentIndex: true,
  sourceAudioUrl: true,
  sourceTimestamp: true,
  status: true,
  pitchMeanHz: true,
  pitchRangeHz: true,
  energyVariance: true,
  wordsPerMinute: true,
  longPauseCount: true,
  pauseFreqPerMin: true,
  rawMetrics: true,
  error: true,
});

// Types
export type Student = typeof students.$inferSelect;
export type InsertStudent = z.infer<typeof insertStudentSchema>;

export type TrainingSession = typeof trainingSessions.$inferSelect;
export type InsertTrainingSession = z.infer<typeof insertTrainingSessionSchema>;

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;

export type Feedback = typeof feedback.$inferSelect;
export type InsertFeedback = z.infer<typeof insertFeedbackSchema>;

export type AiPrompt = typeof aiPrompts.$inferSelect;
export type InsertAiPrompt = z.infer<typeof insertAiPromptSchema>;

export type ProsodyJob = typeof prosodyJobs.$inferSelect;
export type InsertProsodyJob = z.infer<typeof insertProsodyJobSchema>;

export type ProsodySegmentMetric = typeof prosodySegmentMetrics.$inferSelect;
export type InsertProsodySegmentMetric = z.infer<typeof insertProsodySegmentMetricSchema>;

export type Message = {
  role: 'student' | 'ai';
  content: string;
  timestamp: string;
  audioUrl?: string;
};

export type FeedbackMessage = {
  role: 'student' | 'teacher';
  content: string;
  timestamp: string;
  audioUrl?: string;
};
