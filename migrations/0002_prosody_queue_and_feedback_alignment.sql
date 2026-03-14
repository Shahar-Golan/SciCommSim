-- Prerequisite alignment: ensure feedback supports current runtime text fields
ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "strengths" text;
ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "improvements" text;
ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "summary" text;

-- Step 1 foundation: async prosody job queue per conversation
CREATE TABLE IF NOT EXISTS "prosody_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL,
  "status" varchar DEFAULT 'pending' NOT NULL,
  "total_segments" integer DEFAULT 0 NOT NULL,
  "processed_segments" integer DEFAULT 0 NOT NULL,
  "error" text,
  "enqueued_at" timestamp DEFAULT now(),
  "started_at" timestamp,
  "finished_at" timestamp,
  "updated_at" timestamp DEFAULT now(),
  CONSTRAINT "prosody_jobs_conversation_id_unique" UNIQUE("conversation_id")
);

DO $$ BEGIN
  ALTER TABLE "prosody_jobs"
    ADD CONSTRAINT "prosody_jobs_conversation_id_conversations_id_fk"
    FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Per-student-speech segment records (one row per student audioUrl turn)
CREATE TABLE IF NOT EXISTS "prosody_segment_metrics" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_id" uuid NOT NULL,
  "conversation_id" uuid NOT NULL,
  "feedback_id" uuid,
  "segment_index" integer NOT NULL,
  "source_audio_url" text NOT NULL,
  "source_timestamp" timestamp,
  "status" varchar DEFAULT 'pending' NOT NULL,
  "pitch_mean_hz" numeric(10, 2),
  "pitch_range_hz" numeric(10, 2),
  "energy_variance" numeric(12, 6),
  "words_per_minute" numeric(10, 2),
  "long_pause_count" integer,
  "pause_freq_per_min" numeric(10, 2),
  "raw_metrics" jsonb,
  "error" text,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "prosody_segment_metrics"
    ADD CONSTRAINT "prosody_segment_metrics_job_id_prosody_jobs_id_fk"
    FOREIGN KEY ("job_id") REFERENCES "public"."prosody_jobs"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "prosody_segment_metrics"
    ADD CONSTRAINT "prosody_segment_metrics_conversation_id_conversations_id_fk"
    FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "prosody_segment_metrics"
    ADD CONSTRAINT "prosody_segment_metrics_feedback_id_feedback_id_fk"
    FOREIGN KEY ("feedback_id") REFERENCES "public"."feedback"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "prosody_segment_metrics_conversation_idx"
  ON "prosody_segment_metrics" ("conversation_id", "segment_index");
