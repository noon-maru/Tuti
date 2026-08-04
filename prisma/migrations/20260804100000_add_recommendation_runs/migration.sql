CREATE TABLE "recommendation_runs" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "algorithm_version" TEXT NOT NULL,
  "answers" JSONB NOT NULL,
  "state" JSONB NOT NULL,
  "entry_status" TEXT,
  "location_used" BOOLEAN NOT NULL DEFAULT false,
  "state_text_used" BOOLEAN NOT NULL DEFAULT false,
  "candidates" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "recommendation_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "recommendation_runs_user_id_created_at_idx"
  ON "recommendation_runs"("user_id", "created_at");
CREATE INDEX "recommendation_runs_algorithm_version_created_at_idx"
  ON "recommendation_runs"("algorithm_version", "created_at");
CREATE INDEX "recommendation_runs_created_at_idx"
  ON "recommendation_runs"("created_at");

ALTER TABLE "recommendation_runs"
  ADD CONSTRAINT "recommendation_runs_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
