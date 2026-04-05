ALTER TABLE IF EXISTS "test_feedback_access_requests"
  DROP COLUMN IF EXISTS "username";

ALTER TABLE IF EXISTS "test_feedback_access_users"
  DROP COLUMN IF EXISTS "username";
