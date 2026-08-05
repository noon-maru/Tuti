CREATE TYPE "PlaceCandidateStatus" AS ENUM (
  'selected',
  'enrich',
  'pending',
  'low_burden_mismatch',
  'invalid'
);

CREATE TYPE "PlaceCandidateOverride" AS ENUM ('auto', 'include', 'exclude');

ALTER TABLE "places"
  ADD COLUMN "candidate_status" "PlaceCandidateStatus",
  ADD COLUMN "candidate_score" INTEGER,
  ADD COLUMN "candidate_sections" JSONB,
  ADD COLUMN "candidate_reasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "candidate_exclusions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "candidate_evaluated_at" TIMESTAMP(3),
  ADD COLUMN "candidate_algorithm_version" TEXT,
  ADD COLUMN "candidate_override" "PlaceCandidateOverride" NOT NULL DEFAULT 'auto';

-- 기존에 관리자가 승인해 노출하던 장소는 자동 판정 도입 후에도 유지합니다.
UPDATE "places"
SET "candidate_override" = 'include'
WHERE "source" = 'tourapi'
  AND "review_status" = 'approved'
  AND "is_active" = true;

CREATE INDEX "places_source_candidate_status_candidate_override_idx"
  ON "places"("source", "candidate_status", "candidate_override");
