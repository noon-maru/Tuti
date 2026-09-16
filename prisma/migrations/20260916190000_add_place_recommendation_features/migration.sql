ALTER TABLE "places"
  ADD COLUMN "experience_type" TEXT,
  ADD COLUMN "experience_type_confidence" INTEGER,
  ADD COLUMN "experience_type_evidence" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "recommendation_feature_version" TEXT,
  ADD COLUMN "recommendation_feature_derived_at" TIMESTAMP(3);

CREATE INDEX "places_experience_type_idx" ON "places"("experience_type");
