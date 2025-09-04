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
  createdAt: timestamp("created_at").defaultNow(),
});

// AI prompts configuration
export const aiPrompts = pgTable("ai_prompts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").unique().notNull(),
  prompt: text("prompt").notNull(),
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
  recommendations: true,
});

export const insertAiPromptSchema = createInsertSchema(aiPrompts).pick({
  name: true,
  prompt: true,
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

export type Message = {
  role: 'student' | 'ai';
  content: string;
  timestamp: string;
  audioUrl?: string;
};
