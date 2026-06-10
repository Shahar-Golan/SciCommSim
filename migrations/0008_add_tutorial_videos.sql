CREATE TABLE IF NOT EXISTS "tutorial_videos" (
  "key" varchar(32) PRIMARY KEY NOT NULL,
  "blob_name" text NOT NULL,
  "video_url" text NOT NULL,
  "updated_at" timestamp DEFAULT now()
);
