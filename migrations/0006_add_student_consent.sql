ALTER TABLE "students"
ADD COLUMN "consent" varchar(1) NOT NULL DEFAULT 'N';

ALTER TABLE "students"
ADD CONSTRAINT "students_consent_check"
CHECK ("consent" IN ('Y', 'N'));
