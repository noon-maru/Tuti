ALTER TABLE "places"
ADD COLUMN "source_content_type" TEXT,
ADD COLUMN "source_address" TEXT,
ADD COLUMN "source_copyright" TEXT,
ADD COLUMN "source_modified_at" TIMESTAMP(3),
ADD COLUMN "source_synced_at" TIMESTAMP(3);

CREATE INDEX "places_source_content_type_review_status_idx"
ON "places"("source", "source_content_type", "review_status");
