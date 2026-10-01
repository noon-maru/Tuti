ALTER TABLE "tourism_place_detail_records"
  ADD COLUMN "overview_summary" TEXT,
  ADD COLUMN "summary_source_fingerprint" TEXT,
  ADD COLUMN "summary_model" TEXT,
  ADD COLUMN "summary_version" TEXT,
  ADD COLUMN "summary_generated_at" TIMESTAMP(3);

CREATE INDEX "tourism_place_detail_records_summary_version_idx"
ON "tourism_place_detail_records"("summary_version");
