CREATE TABLE IF NOT EXISTS "feedback_routing_state" (
  "id" varchar(32) PRIMARY KEY NOT NULL,
  "counter" integer NOT NULL DEFAULT 0
);

INSERT INTO "feedback_routing_state" ("id", "counter")
VALUES ('default', 0)
ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "feedback"
ADD COLUMN IF NOT EXISTS "group" varchar(1) NOT NULL DEFAULT 'C';

ALTER TABLE "feedback"
ALTER COLUMN "group" DROP DEFAULT;