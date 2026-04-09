CREATE TABLE IF NOT EXISTS "test_feedback_access_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" varchar(320) NOT NULL,
  "password_hash" text NOT NULL,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "requested_at" timestamp DEFAULT now(),
  "reviewed_at" timestamp,
  CONSTRAINT "test_feedback_access_requests_email_unique" UNIQUE("email"),
  CONSTRAINT "test_feedback_access_requests_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected'))
);

CREATE TABLE IF NOT EXISTS "test_feedback_access_users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" varchar(320) NOT NULL,
  "password_hash" text NOT NULL,
  "approved_at" timestamp DEFAULT now(),
  CONSTRAINT "test_feedback_access_users_email_unique" UNIQUE("email")
);

CREATE UNIQUE INDEX IF NOT EXISTS "test_feedback_access_requests_email_lower_unique"
  ON "test_feedback_access_requests" (lower("email"));

CREATE UNIQUE INDEX IF NOT EXISTS "test_feedback_access_users_email_lower_unique"
  ON "test_feedback_access_users" (lower("email"));