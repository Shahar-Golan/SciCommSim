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
	strengths: text(),
	improvements: text(),
	summary: text(),
	dialogueTranscript: jsonb("dialogue_transcript").default([]),
	dialogueCompleted: timestamp("dialogue_completed", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.conversationId],
			foreignColumns: [conversations.id],
			name: "feedback_conversation_id_conversations_id_fk"
		}),
]);

export const prosodyJobs = pgTable("prosody_jobs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	conversationId: uuid("conversation_id").notNull(),
	status: varchar().default('pending').notNull(),
	totalSegments: integer("total_segments").default(0).notNull(),
	processedSegments: integer("processed_segments").default(0).notNull(),
	error: text(),
	enqueuedAt: timestamp("enqueued_at", { mode: 'string' }).defaultNow(),
	startedAt: timestamp("started_at", { mode: 'string' }),
	finishedAt: timestamp("finished_at", { mode: 'string' }),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	unique("prosody_jobs_conversation_id_unique").on(table.conversationId),
	foreignKey({
			columns: [table.conversationId],
			foreignColumns: [conversations.id],
			name: "prosody_jobs_conversation_id_conversations_id_fk"
		}),
]);

export const prosodySegmentMetrics = pgTable("prosody_segment_metrics", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	jobId: uuid("job_id").notNull(),
	conversationId: uuid("conversation_id").notNull(),
	feedbackId: uuid("feedback_id"),
	segmentIndex: integer("segment_index").notNull(),
	sourceAudioUrl: text("source_audio_url").notNull(),
	sourceTimestamp: timestamp("source_timestamp", { mode: 'string' }),
	status: varchar().default('pending').notNull(),
	pitchMeanHz: numeric("pitch_mean_hz", { precision: 10, scale:  2 }),
	pitchRangeHz: numeric("pitch_range_hz", { precision: 10, scale:  2 }),
	energyVariance: numeric("energy_variance", { precision: 12, scale:  6 }),
	wordsPerMinute: numeric("words_per_minute", { precision: 10, scale:  2 }),
	longPauseCount: integer("long_pause_count"),
	pauseFreqPerMin: numeric("pause_freq_per_min", { precision: 10, scale:  2 }),
	rawMetrics: jsonb("raw_metrics"),
	error: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.jobId],
			foreignColumns: [prosodyJobs.id],
			name: "prosody_segment_metrics_job_id_prosody_jobs_id_fk"
		}),
	foreignKey({
			columns: [table.conversationId],
			foreignColumns: [conversations.id],
			name: "prosody_segment_metrics_conversation_id_conversations_id_fk"
		}),
	foreignKey({
			columns: [table.feedbackId],
			foreignColumns: [feedback.id],
			name: "prosody_segment_metrics_feedback_id_feedback_id_fk"
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
