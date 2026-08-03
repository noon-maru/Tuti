CREATE TABLE "tourism_place_detail_records" (
  "content_id" TEXT NOT NULL,
  "content_type_id" TEXT,
  "overview" TEXT,
  "homepage" TEXT,
  "phone" TEXT,
  "opening_hours" TEXT,
  "rest_date" TEXT,
  "admission_fee" TEXT,
  "parking" TEXT,
  "reservation" TEXT,
  "usage_duration" TEXT,
  "experience_guide" TEXT,
  "common_payload" JSONB,
  "intro_payload" JSONB,
  "info_payload" JSONB,
  "image_payload" JSONB,
  "source_modified_at" TIMESTAMP(3),
  "synced_at" TIMESTAMP(3),
  "last_attempt_at" TIMESTAMP(3),
  "retry_after" TIMESTAMP(3),
  "last_error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "tourism_place_detail_records_pkey" PRIMARY KEY ("content_id")
);

CREATE INDEX "tourism_place_detail_records_retry_after_idx"
ON "tourism_place_detail_records"("retry_after");

CREATE INDEX "tourism_place_detail_records_synced_at_idx"
ON "tourism_place_detail_records"("synced_at");

ALTER TABLE "tourism_place_detail_records"
ADD CONSTRAINT "tourism_place_detail_records_content_id_fkey"
FOREIGN KEY ("content_id") REFERENCES "tourism_place_source_records"("content_id")
ON DELETE CASCADE ON UPDATE CASCADE;
