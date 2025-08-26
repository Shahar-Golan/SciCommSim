import { relations } from "drizzle-orm/relations";
import { conversations, feedback, trainingSessions, students } from "./schema";

export const feedbackRelations = relations(feedback, ({one}) => ({
	conversation: one(conversations, {
		fields: [feedback.conversationId],
		references: [conversations.id]
	}),
}));

export const conversationsRelations = relations(conversations, ({one, many}) => ({
	feedbacks: many(feedback),
	trainingSession: one(trainingSessions, {
		fields: [conversations.sessionId],
		references: [trainingSessions.id]
	}),
}));

export const trainingSessionsRelations = relations(trainingSessions, ({one, many}) => ({
	conversations: many(conversations),
	student: one(students, {
		fields: [trainingSessions.studentId],
		references: [students.id]
	}),
}));

export const studentsRelations = relations(students, ({many}) => ({
	trainingSessions: many(trainingSessions),
}));