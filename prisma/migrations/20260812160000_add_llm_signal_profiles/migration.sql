CREATE TABLE "place_meaning_profiles" (
  "place_id" TEXT NOT NULL,
  "traits" JSONB NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL,
  "evidence" JSONB NOT NULL,
  "source_fingerprint" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "profile_version" TEXT NOT NULL,
  "generated_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "place_meaning_profiles_pkey" PRIMARY KEY ("place_id")
);

CREATE INDEX "place_meaning_profiles_generated_at_idx"
  ON "place_meaning_profiles"("generated_at");
CREATE INDEX "place_meaning_profiles_profile_version_idx"
  ON "place_meaning_profiles"("profile_version");

ALTER TABLE "place_meaning_profiles"
  ADD CONSTRAINT "place_meaning_profiles_place_id_fkey"
  FOREIGN KEY ("place_id") REFERENCES "places"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "user_signal_profiles" (
  "user_id" TEXT NOT NULL,
  "preferences" JSONB NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL,
  "evidence_count" INTEGER NOT NULL,
  "source_cursor" TIMESTAMP(3),
  "model" TEXT NOT NULL,
  "profile_version" TEXT NOT NULL,
  "generated_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "user_signal_profiles_pkey" PRIMARY KEY ("user_id")
);

CREATE INDEX "user_signal_profiles_generated_at_idx"
  ON "user_signal_profiles"("generated_at");
CREATE INDEX "user_signal_profiles_profile_version_idx"
  ON "user_signal_profiles"("profile_version");

ALTER TABLE "user_signal_profiles"
  ADD CONSTRAINT "user_signal_profiles_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "recommendation_runs"
  ADD COLUMN "personalization" JSONB;
