CREATE TABLE "place_visit_time_profiles" (
  "place_id" TEXT NOT NULL,
  "stay_minimum_minutes" INTEGER NOT NULL,
  "stay_typical_minutes" INTEGER NOT NULL,
  "stay_maximum_minutes" INTEGER NOT NULL,
  "stay_source" TEXT NOT NULL,
  "stay_flexibility" TEXT NOT NULL,
  "parking_availability" TEXT NOT NULL,
  "car_suitability" TEXT NOT NULL,
  "entry_process" TEXT NOT NULL,
  "reservation_requirement" TEXT NOT NULL,
  "access_constraint" TEXT NOT NULL,
  "parking_buffer_minimum_minutes" INTEGER NOT NULL,
  "parking_buffer_typical_minutes" INTEGER NOT NULL,
  "parking_buffer_maximum_minutes" INTEGER NOT NULL,
  "entry_buffer_minimum_minutes" INTEGER NOT NULL,
  "entry_buffer_typical_minutes" INTEGER NOT NULL,
  "entry_buffer_maximum_minutes" INTEGER NOT NULL,
  "confidence" INTEGER NOT NULL,
  "evidence" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "fallback_fields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "source_fingerprint" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "profile_version" TEXT NOT NULL,
  "generated_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "place_visit_time_profiles_pkey" PRIMARY KEY ("place_id"),
  CONSTRAINT "place_visit_time_profiles_place_id_fkey"
    FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "place_visit_time_profiles_stay_range_check" CHECK (
    "stay_minimum_minutes" BETWEEN 10 AND 720
    AND "stay_typical_minutes" BETWEEN "stay_minimum_minutes" AND 720
    AND "stay_maximum_minutes" BETWEEN "stay_typical_minutes" AND 720
  ),
  CONSTRAINT "place_visit_time_profiles_confidence_check" CHECK (
    "confidence" BETWEEN 0 AND 100
  ),
  CONSTRAINT "place_visit_time_profiles_buffer_check" CHECK (
    "parking_buffer_minimum_minutes" BETWEEN 0 AND 120
    AND "parking_buffer_typical_minutes" BETWEEN "parking_buffer_minimum_minutes" AND 120
    AND "parking_buffer_maximum_minutes" BETWEEN "parking_buffer_typical_minutes" AND 120
    AND "entry_buffer_minimum_minutes" BETWEEN 0 AND 120
    AND "entry_buffer_typical_minutes" BETWEEN "entry_buffer_minimum_minutes" AND 120
    AND "entry_buffer_maximum_minutes" BETWEEN "entry_buffer_typical_minutes" AND 120
  )
);

CREATE INDEX "place_visit_time_profiles_profile_version_idx"
  ON "place_visit_time_profiles"("profile_version");
CREATE INDEX "place_visit_time_profiles_stay_source_idx"
  ON "place_visit_time_profiles"("stay_source");
