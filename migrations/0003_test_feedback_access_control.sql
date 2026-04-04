CREATE TABLE IF NOT EXISTS "test_feedback_access_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "username" varchar(64) NOT NULL,
  "email" varchar(320) NOT NULL,
  "password_hash" text NOT NULL,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "requested_at" timestamp DEFAULT now(),
  "reviewed_at" timestamp,
  CONSTRAINT "test_feedback_access_requests_username_unique" UNIQUE("username"),
  CONSTRAINT "test_feedback_access_requests_email_unique" UNIQUE("email")
);

CREATE TABLE IF NOT EXISTS "test_feedback_access_users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "username" varchar(64) NOT NULL,
  "email" varchar(320) NOT NULL,
  "password_hash" text NOT NULL,
  "approved_at" timestamp DEFAULT now(),
  CONSTRAINT "test_feedback_access_users_username_unique" UNIQUE("username"),
  CONSTRAINT "test_feedback_access_users_email_unique" UNIQUE("email")
);
