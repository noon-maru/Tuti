CREATE TABLE "accommodation_source_records" (
  "content_id" TEXT NOT NULL,
  "content_type_id" TEXT NOT NULL DEFAULT '32',
  "name" TEXT NOT NULL,
  "address" TEXT,
  "area_code" TEXT,
  "sigungu_code" TEXT,
  "latitude" DECIMAL(9, 6) NOT NULL,
  "longitude" DECIMAL(9, 6) NOT NULL,
  "image" TEXT,
  "thumbnail" TEXT,
  "phone" TEXT,
  "category_code" TEXT,
  "check_in_time" TEXT,
  "check_out_time" TEXT,
  "room_count" TEXT,
  "room_type" TEXT,
  "reservation" TEXT,
  "reservation_url" TEXT,
  "parking" TEXT,
  "pickup" TEXT,
  "food_place" TEXT,
  "sub_facility" TEXT,
  "homepage" TEXT,
  "overview" TEXT,
  "raw_payload" JSONB NOT NULL,
  "intro_payload" JSONB,
  "info_payload" JSONB,
  "image_payload" JSONB,
  "source_modified_at" TIMESTAMP(3),
  "source_synced_at" TIMESTAMP(3) NOT NULL,
  "detail_synced_at" TIMESTAMP(3),
  "detail_retry_after" TIMESTAMP(3),
  "detail_last_error" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "accommodation_source_records_pkey" PRIMARY KEY ("content_id")
);

CREATE INDEX "accommodation_source_records_area_code_sigungu_code_idx"
  ON "accommodation_source_records"("area_code", "sigungu_code");
CREATE INDEX "accommodation_source_records_latitude_longitude_idx"
  ON "accommodation_source_records"("latitude", "longitude");
CREATE INDEX "accommodation_source_records_is_active_detail_synced_at_idx"
  ON "accommodation_source_records"("is_active", "detail_synced_at");
