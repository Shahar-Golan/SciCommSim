-- Add dialogue fields to feedback table
ALTER TABLE "feedback" ADD COLUMN "dialogue_transcript" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "feedback" ADD COLUMN "dialogue_completed" timestamp;
