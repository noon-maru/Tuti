CREATE TYPE "LocationConsentStatus" AS ENUM ('accepted', 'declined', 'withdrawn');
CREATE TYPE "LocationAcquisitionSource" AS ENUM ('device', 'photo_exif');
CREATE TYPE "LocationUsageService" AS ENUM ('recommendation', 'travel_time', 'departure_plan', 'photo_nearby');
CREATE TYPE "LocationUsageKind" AS ENUM ('internal_use', 'external_transfer');

CREATE TABLE "location_consent_events" (
  "id" TEXT NOT NULL,
  "user_id" TEXT,
  "subject_key" TEXT NOT NULL,
  "status" "LocationConsentStatus" NOT NULL,
  "terms_version" TEXT NOT NULL,
  "age_confirmed" BOOLEAN NOT NULL DEFAULT false,
  "client_platform" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "location_consent_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "location_usage_logs" (
  "id" TEXT NOT NULL,
  "user_id" TEXT,
  "subject_key" TEXT NOT NULL,
  "consent_event_id" TEXT,
  "terms_version" TEXT NOT NULL,
  "acquisition_source" "LocationAcquisitionSource" NOT NULL,
  "service" "LocationUsageService" NOT NULL,
  "kind" "LocationUsageKind" NOT NULL,
  "method" TEXT NOT NULL,
  "external_recipient" TEXT,
  "external_purpose" TEXT,
  "external_mode" TEXT,
  "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "retention_until" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "location_usage_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "location_consent_events_user_id_created_at_idx"
  ON "location_consent_events"("user_id", "created_at");
CREATE INDEX "location_consent_events_subject_key_created_at_idx"
  ON "location_consent_events"("subject_key", "created_at");
CREATE INDEX "location_consent_events_created_at_idx"
  ON "location_consent_events"("created_at");
CREATE INDEX "location_usage_logs_user_id_occurred_at_idx"
  ON "location_usage_logs"("user_id", "occurred_at");
CREATE INDEX "location_usage_logs_subject_key_occurred_at_idx"
  ON "location_usage_logs"("subject_key", "occurred_at");
CREATE INDEX "location_usage_logs_retention_until_idx"
  ON "location_usage_logs"("retention_until");
CREATE INDEX "location_usage_logs_service_occurred_at_idx"
  ON "location_usage_logs"("service", "occurred_at");
CREATE INDEX "location_usage_logs_kind_external_recipient_occurred_at_idx"
  ON "location_usage_logs"("kind", "external_recipient", "occurred_at");

ALTER TABLE "location_consent_events"
  ADD CONSTRAINT "location_consent_events_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "location_usage_logs"
  ADD CONSTRAINT "location_usage_logs_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "location_usage_logs"
  ADD CONSTRAINT "location_usage_logs_consent_event_id_fkey"
  FOREIGN KEY ("consent_event_id") REFERENCES "location_consent_events"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 원본 좌표를 여러 장소까지의 정밀 거리로 역추정할 수 없도록 기존 추천
-- 스냅샷의 거리값을 서비스 분석에 충분한 구간값으로 최소화합니다.
UPDATE "recommendation_runs" AS run
SET "candidates" = COALESCE(
  (
    SELECT jsonb_agg(
      (candidate - 'distanceMeters') || jsonb_build_object(
        'distanceBand',
        CASE
          WHEN candidate->>'distanceMeters' IS NULL THEN NULL
          WHEN (candidate->>'distanceMeters')::double precision < 2000 THEN 'under_2km'
          WHEN (candidate->>'distanceMeters')::double precision < 10000 THEN '2_to_10km'
          WHEN (candidate->>'distanceMeters')::double precision < 30000 THEN '10_to_30km'
          WHEN (candidate->>'distanceMeters')::double precision < 100000 THEN '30_to_100km'
          ELSE 'over_100km'
        END
      )
      ORDER BY ordinal
    )
    FROM jsonb_array_elements(run."candidates") WITH ORDINALITY AS item(candidate, ordinal)
  ),
  '[]'::jsonb
)
WHERE jsonb_typeof(run."candidates") = 'array';
