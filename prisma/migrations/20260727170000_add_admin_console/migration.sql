CREATE TYPE "UserRole" AS ENUM ('user', 'admin');
CREATE TYPE "PlaceReviewStatus" AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE "LogLevel" AS ENUM ('info', 'warning', 'error');
CREATE TYPE "ReportReason" AS ENUM (
  'inappropriate',
  'copyright',
  'privacy',
  'spam',
  'other'
);
CREATE TYPE "ReportStatus" AS ENUM (
  'pending',
  'reviewing',
  'resolved',
  'dismissed'
);

ALTER TABLE "users"
ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'user';

ALTER TABLE "places"
ADD COLUMN "source" TEXT NOT NULL DEFAULT 'manual',
ADD COLUMN "source_id" TEXT,
ADD COLUMN "review_status" "PlaceReviewStatus" NOT NULL DEFAULT 'approved',
ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "places_source_review_status_is_active_idx"
ON "places"("source", "review_status", "is_active");

CREATE UNIQUE INDEX "places_source_source_id_key"
ON "places"("source", "source_id");

CREATE TABLE "system_logs" (
  "id" TEXT NOT NULL,
  "level" "LogLevel" NOT NULL DEFAULT 'info',
  "category" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "actor_user_id" TEXT,
  "target_type" TEXT,
  "target_id" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "system_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "system_logs_created_at_idx"
ON "system_logs"("created_at");

CREATE INDEX "system_logs_level_created_at_idx"
ON "system_logs"("level", "created_at");

CREATE INDEX "system_logs_category_created_at_idx"
ON "system_logs"("category", "created_at");

CREATE INDEX "system_logs_actor_user_id_idx"
ON "system_logs"("actor_user_id");

CREATE INDEX "system_logs_target_type_target_id_idx"
ON "system_logs"("target_type", "target_id");

CREATE TABLE "content_reports" (
  "id" TEXT NOT NULL,
  "reporter_user_id" TEXT NOT NULL,
  "entry_id" TEXT,
  "target_owner_id" TEXT NOT NULL,
  "target_title" TEXT NOT NULL,
  "target_public_id" TEXT,
  "reason" "ReportReason" NOT NULL,
  "detail" TEXT,
  "status" "ReportStatus" NOT NULL DEFAULT 'pending',
  "reviewer_user_id" TEXT,
  "resolution_note" TEXT,
  "reviewed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "content_reports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "content_reports_status_created_at_idx"
ON "content_reports"("status", "created_at");

CREATE INDEX "content_reports_entry_id_idx"
ON "content_reports"("entry_id");

CREATE INDEX "content_reports_reporter_user_id_created_at_idx"
ON "content_reports"("reporter_user_id", "created_at");

CREATE TABLE "app_settings" (
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "updated_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);
