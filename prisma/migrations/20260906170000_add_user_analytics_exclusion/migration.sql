ALTER TABLE "users"
  ADD COLUMN "analytics_excluded_at" TIMESTAMP(3),
  ADD COLUMN "analytics_exclusion_reason" TEXT,
  ADD COLUMN "analytics_excluded_by_user_id" TEXT;

CREATE INDEX "users_analytics_excluded_at_idx"
  ON "users"("analytics_excluded_at");
