ALTER TABLE "tourism_place_detail_records"
ADD COLUMN "editorial_synced_at" TIMESTAMP(3),
ADD COLUMN "editorial_attempt_at" TIMESTAMP(3),
ADD COLUMN "editorial_retry_after" TIMESTAMP(3),
ADD COLUMN "editorial_last_error" TEXT;

UPDATE "tourism_place_detail_records"
SET
  "editorial_synced_at" = "synced_at",
  "editorial_attempt_at" = "last_attempt_at"
WHERE "synced_at" IS NOT NULL;

CREATE INDEX "tourism_place_detail_records_editorial_retry_after_idx"
ON "tourism_place_detail_records"("editorial_retry_after");

CREATE INDEX "tourism_place_detail_records_editorial_synced_at_idx"
ON "tourism_place_detail_records"("editorial_synced_at");
