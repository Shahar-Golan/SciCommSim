import {
  students,
  trainingSessions,
  conversations,
  feedback,
  aiPrompts,
  prosodyJobs,
  prosodySegmentMetrics,
  type Student,
  type InsertStudent,
  type TrainingSession,
  type InsertTrainingSession,
  type Conversation,
  type InsertConversation,
  type Feedback,
  type InsertFeedback,
  type AiPrompt,
  type InsertAiPrompt,
  type ProsodyJob,
  type ProsodySegmentMetric,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, asc } from "drizzle-orm";

export interface IStorage {
  // Students
  createStudent(student: InsertStudent): Promise<Student>;
  getStudent(id: string): Promise<Student | undefined>;

  // Training sessions
  createTrainingSession(session: InsertTrainingSession): Promise<TrainingSession>;
  updateTrainingSession(id: string, updates: Partial<TrainingSession>): Promise<TrainingSession>;
  getTrainingSession(id: string): Promise<TrainingSession | undefined>;
  getAllTrainingSessions(): Promise<TrainingSession[]>;
  getSessionSummary(sessionId: string): Promise<{
    session: TrainingSession;
    student: Student;
    conversations: Array<{
      conversation: Conversation;
      feedback: Feedback | null;
    }>;
  } | undefined>;

  // Conversations
  createConversation(conversation: InsertConversation): Promise<Conversation>;
  updateConversation(id: string, updates: Partial<Conversation>): Promise<Conversation>;
  getConversation(id: string): Promise<Conversation | undefined>;
  getConversationsBySession(sessionId: string): Promise<Conversation[]>;

  // Feedback
  createFeedback(feedbackData: InsertFeedback): Promise<Feedback>;
  getFeedbackByConversation(conversationId: string): Promise<Feedback | undefined>;
  updateFeedback(id: string, updates: Partial<Feedback>): Promise<Feedback>;

  // AI Prompts
  getAiPrompt(name: string): Promise<AiPrompt | undefined>;
  upsertAiPrompt(prompt: InsertAiPrompt): Promise<AiPrompt>;
  getAllAiPrompts(): Promise<AiPrompt[]>;

  // Prosody async jobs
  enqueueProsodyJobForConversation(conversationId: string): Promise<ProsodyJob | undefined>;
  getProsodyJobByConversation(conversationId: string): Promise<ProsodyJob | undefined>;
  listProsodySegmentsByConversation(conversationId: string): Promise<ProsodySegmentMetric[]>;
}

export class DatabaseStorage implements IStorage {
  async createStudent(studentData: InsertStudent): Promise<Student> {
    const [student] = await db
      .insert(students)
      .values(studentData)
      .returning();
    return student;
  }

  async getStudent(id: string): Promise<Student | undefined> {
    const [student] = await db
      .select()
      .from(students)
      .where(eq(students.id, id));
    return student;
  }

  async createTrainingSession(sessionData: InsertTrainingSession): Promise<TrainingSession> {
    const [session] = await db
      .insert(trainingSessions)
      .values(sessionData)
      .returning();
    return session;
  }

  async updateTrainingSession(id: string, updates: Partial<TrainingSession>): Promise<TrainingSession> {
    // Convert string timestamps to Date objects if needed
    const processedUpdates = { ...updates };
    
    if (updates.completedAt && typeof updates.completedAt === 'string') {
      processedUpdates.completedAt = new Date(updates.completedAt);
    }
    if (updates.startedAt && typeof updates.startedAt === 'string') {
      processedUpdates.startedAt = new Date(updates.startedAt);
    }
    
    const [session] = await db
      .update(trainingSessions)
      .set(processedUpdates)
      .where(eq(trainingSessions.id, id))
      .returning();
    return session;
  }

  async getTrainingSession(id: string): Promise<TrainingSession | undefined> {
    const [session] = await db
      .select()
      .from(trainingSessions)
      .where(eq(trainingSessions.id, id));
    return session;
  }

  async getAllTrainingSessions(): Promise<(TrainingSession & { studentName: string; conversations: Conversation[]; feedbacks: any[] })[]> {
    const sessions = await db
      .select({
        id: trainingSessions.id,
        studentId: trainingSessions.studentId,
        startedAt: trainingSessions.startedAt,
        completedAt: trainingSessions.completedAt,
        helpfulnessRating: trainingSessions.helpfulnessRating,
        experienceFeedback: trainingSessions.experienceFeedback,
        studentName: students.name,
      })
      .from(trainingSessions)
      .leftJoin(students, eq(trainingSessions.studentId, students.id))
      .orderBy(desc(trainingSessions.startedAt));

    // Get conversations and feedback for each session
    const sessionsWithDetails = await Promise.all(
      sessions.map(async (session) => {
        const sessionConversations = await db
          .select()
          .from(conversations)
          .where(eq(conversations.sessionId, session.id))
          .orderBy(conversations.conversationNumber);

        // Get feedback for each conversation individually to avoid array issues
        const sessionFeedbacks = [];
        for (const conversation of sessionConversations) {
          const conversationFeedback = await db
            .select()
            .from(feedback)
            .where(eq(feedback.conversationId, conversation.id));
          sessionFeedbacks.push(...conversationFeedback);
        }

        return {
          ...session,
          studentName: session.studentName || 'Unknown Student',
          conversations: sessionConversations,
          feedbacks: sessionFeedbacks,
        };
      })
    );

    return sessionsWithDetails;
  }

  async getSessionSummary(sessionId: string): Promise<{
    session: TrainingSession;
    student: Student;
    conversations: Array<{
      conversation: Conversation;
      feedback: Feedback | null;
    }>;
  } | undefined> {
    // Get the training session
    const session = await this.getTrainingSession(sessionId);
    if (!session) {
      return undefined;
    }

    // Get the student
    const student = await this.getStudent(session.studentId);
    if (!student) {
      return undefined;
    }

    // Get conversations for this session
    const sessionConversations = await this.getConversationsBySession(sessionId);

    // Get feedback for each conversation
    const conversationsWithFeedback = await Promise.all(
      sessionConversations.map(async (conversation) => {
        const feedbackData = await this.getFeedbackByConversation(conversation.id);
        return {
          conversation,
          feedback: feedbackData || null,
        };
      })
    );

    return {
      session,
      student,
      conversations: conversationsWithFeedback,
    };
  }

  async createConversation(conversationData: InsertConversation): Promise<Conversation> {
    const insertData = {
      ...conversationData,
      transcript: conversationData.transcript as any // Type assertion for JSON array
    };
    const [conversation] = await db
      .insert(conversations)
      .values(insertData)
      .returning();
    return conversation;
  }

  async updateConversation(id: string, updates: Partial<Conversation>): Promise<Conversation> {
    // Convert string timestamps to Date objects if needed
    const processedUpdates = { ...updates };
    if (updates.endedAt && typeof updates.endedAt === 'string') {
      processedUpdates.endedAt = new Date(updates.endedAt);
    }
    if (updates.startedAt && typeof updates.startedAt === 'string') {
      processedUpdates.startedAt = new Date(updates.startedAt);
    }
    
    const [conversation] = await db
      .update(conversations)
      .set(processedUpdates)
      .where(eq(conversations.id, id))
      .returning();
    return conversation;
  }

  async getConversation(id: string): Promise<Conversation | undefined> {
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id));
    return conversation;
  }

  async getConversationsBySession(sessionId: string): Promise<Conversation[]> {
    return await db
      .select()
      .from(conversations)
      .where(eq(conversations.sessionId, sessionId))
      .orderBy(conversations.conversationNumber);
  }

  async createFeedback(feedbackData: InsertFeedback): Promise<Feedback> {
    const [feedbackRecord] = await db
      .insert(feedback)
      .values(feedbackData)
      .returning();
    return feedbackRecord;
  }

  async getFeedbackByConversation(conversationId: string): Promise<Feedback | undefined> {
    const [feedbackRecord] = await db
      .select()
      .from(feedback)
      .where(eq(feedback.conversationId, conversationId));
    return feedbackRecord;
  }

  async updateFeedback(id: string, updates: Partial<Feedback>): Promise<Feedback> {
    const processedUpdates = { ...updates };
    
    if (updates.dialogueCompleted && typeof updates.dialogueCompleted === 'string') {
      processedUpdates.dialogueCompleted = new Date(updates.dialogueCompleted);
    }
    
    const [feedbackRecord] = await db
      .update(feedback)
      .set(processedUpdates)
      .where(eq(feedback.id, id))
      .returning();
    return feedbackRecord;
  }

  async getAiPrompt(name: string): Promise<AiPrompt | undefined> {
    const [prompt] = await db
      .select()
      .from(aiPrompts)
      .where(eq(aiPrompts.name, name));
    return prompt;
  }

  async upsertAiPrompt(promptData: InsertAiPrompt): Promise<AiPrompt> {
    const [prompt] = await db
      .insert(aiPrompts)
      .values(promptData)
      .onConflictDoUpdate({
        target: aiPrompts.name,
        set: {
          prompt: promptData.prompt,
          updatedAt: new Date(),
        },
      })
      .returning();
    return prompt;
  }

  async getAllAiPrompts(): Promise<AiPrompt[]> {
    return await db
      .select()
      .from(aiPrompts);
  }

  async enqueueProsodyJobForConversation(conversationId: string): Promise<ProsodyJob | undefined> {
    const conversation = await this.getConversation(conversationId);
    if (!conversation) {
      return undefined;
    }

    const studentAudioTurns = (conversation.transcript || [])
      .filter((msg: any) => msg.role === "student" && typeof msg.audioUrl === "string" && msg.audioUrl.length > 0)
      .sort((a: any, b: any) => {
        const aTime = Date.parse(a.timestamp || "");
        const bTime = Date.parse(b.timestamp || "");
        return (Number.isNaN(aTime) ? 0 : aTime) - (Number.isNaN(bTime) ? 0 : bTime);
      });

    const [job] = await db
      .insert(prosodyJobs)
      .values({
        conversationId,
        status: "pending",
        totalSegments: studentAudioTurns.length,
        processedSegments: 0,
        error: null,
        enqueuedAt: new Date(),
        startedAt: null,
        finishedAt: null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: prosodyJobs.conversationId,
        set: {
          status: "pending",
          totalSegments: studentAudioTurns.length,
          processedSegments: 0,
          error: null,
          enqueuedAt: new Date(),
          startedAt: null,
          finishedAt: null,
          updatedAt: new Date(),
        },
      })
      .returning();

    await db
      .delete(prosodySegmentMetrics)
      .where(eq(prosodySegmentMetrics.conversationId, conversationId));

    if (studentAudioTurns.length > 0) {
      await db
        .insert(prosodySegmentMetrics)
        .values(
          studentAudioTurns.map((turn: any, index: number) => ({
            jobId: job.id,
            conversationId,
            segmentIndex: index,
            sourceAudioUrl: turn.audioUrl,
            sourceTimestamp: turn.timestamp ? new Date(turn.timestamp) : null,
            status: "pending",
            createdAt: new Date(),
            updatedAt: new Date(),
          }))
        );
    }

    return job;
  }

  async getProsodyJobByConversation(conversationId: string): Promise<ProsodyJob | undefined> {
    const [job] = await db
      .select()
      .from(prosodyJobs)
      .where(eq(prosodyJobs.conversationId, conversationId));
    return job;
  }

  async listProsodySegmentsByConversation(conversationId: string): Promise<ProsodySegmentMetric[]> {
    return await db
      .select()
      .from(prosodySegmentMetrics)
      .where(eq(prosodySegmentMetrics.conversationId, conversationId))
      .orderBy(asc(prosodySegmentMetrics.segmentIndex));
  }
}

export const storage = new DatabaseStorage();
