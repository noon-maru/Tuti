CREATE TABLE "tourism_photo_gallery_source_records" (
    "content_id" TEXT NOT NULL,
    "content_type_id" TEXT,
    "title" TEXT NOT NULL,
    "image_url" TEXT NOT NULL,
    "use_flag" TEXT,
    "photography_month" TEXT,
    "photography_location" TEXT,
    "photographer" TEXT,
    "search_keyword" TEXT,
    "source_created_at" TIMESTAMP(3),
    "source_modified_at" TIMESTAMP(3),
    "raw_payload" JSONB NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tourism_photo_gallery_source_records_pkey" PRIMARY KEY ("content_id")
);

CREATE INDEX "tourism_photo_gallery_location_idx"
ON "tourism_photo_gallery_source_records"("photography_location", "synced_at");

CREATE INDEX "tourism_photo_gallery_modified_idx"
ON "tourism_photo_gallery_source_records"("source_modified_at");
