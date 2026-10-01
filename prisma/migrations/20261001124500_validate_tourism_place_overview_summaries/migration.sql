ALTER TABLE "tourism_place_detail_records"
  ADD CONSTRAINT "tourism_place_detail_records_summary_length_check"
  CHECK (
    "overview_summary" IS NULL
    OR char_length(btrim("overview_summary")) BETWEEN 1 AND 180
  ),
  ADD CONSTRAINT "tourism_place_detail_records_summary_metadata_check"
  CHECK (
    (
      "overview_summary" IS NULL
      AND "summary_source_fingerprint" IS NULL
      AND "summary_model" IS NULL
      AND "summary_version" IS NULL
      AND "summary_generated_at" IS NULL
    )
    OR
    (
      "overview_summary" IS NOT NULL
      AND "summary_source_fingerprint" ~ '^[0-9a-f]{64}$'
      AND char_length(btrim("summary_model")) > 0
      AND char_length(btrim("summary_version")) > 0
      AND "summary_generated_at" IS NOT NULL
    )
  );
