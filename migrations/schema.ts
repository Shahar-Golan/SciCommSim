import { pgTable, unique, uuid, varchar, text, timestamp, foreignKey, numeric, jsonb, integer } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const aiPrompts = pgTable("ai_prompts", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: varchar().notNull(),
	prompt: text().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	unique("ai_prompts_name_unique").on(table.name),
]);

export const feedback = pgTable("feedback", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	conversationId: uuid("conversation_id").notNull(),
	overallScore: numeric("overall_score", { precision: 4, scale:  2 }),
	clarityScore: numeric("clarity_score", { precision: 4, scale:  2 }),
	questionHandlingScore: numeric("question_handling_score", { precision: 4, scale:  2 }),
	engagementScore: numeric("engagement_score", { precision: 4, scale:  2 }),
	pacingScore: numeric("pacing_score", { precision: 4, scale:  2 }),
	recommendations: jsonb().default([]),
	detailedFeedback: text("detailed_feedback"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.conversationId],
			foreignColumns: [conversations.id],
			name: "feedback_conversation_id_conversations_id_fk"
		}),
]);

export const students = pgTable("students", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
});

export const conversations = pgTable("conversations", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	sessionId: uuid("session_id").notNull(),
	conversationNumber: integer("conversation_number").notNull(),
	startedAt: timestamp("started_at", { mode: 'string' }).defaultNow(),
	endedAt: timestamp("ended_at", { mode: 'string' }),
	transcript: jsonb().default([]),
	duration: integer(),
}, (table) => [
	foreignKey({
			columns: [table.sessionId],
			foreignColumns: [trainingSessions.id],
			name: "conversations_session_id_training_sessions_id_fk"
		}),
]);

export const trainingSessions = pgTable("training_sessions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	studentId: uuid("student_id").notNull(),
	startedAt: timestamp("started_at", { mode: 'string' }).defaultNow(),
	completedAt: timestamp("completed_at", { mode: 'string' }),
	helpfulnessRating: integer("helpfulness_rating"),
	experienceFeedback: text("experience_feedback"),
}, (table) => [
	foreignKey({
			columns: [table.studentId],
			foreignColumns: [students.id],
			name: "training_sessions_student_id_students_id_fk"
		}),
]);
