CREATE TABLE "related_tourism_source_records" (
    "id" TEXT NOT NULL,
    "base_ym" TEXT NOT NULL,
    "tourist_spot_code" TEXT NOT NULL,
    "tourist_spot_name" TEXT NOT NULL,
    "area_code" TEXT NOT NULL,
    "area_name" TEXT NOT NULL,
    "sigungu_code" TEXT NOT NULL,
    "sigungu_name" TEXT NOT NULL,
    "related_tourist_spot_code" TEXT NOT NULL,
    "related_tourist_spot_name" TEXT NOT NULL,
    "related_area_code" TEXT NOT NULL,
    "related_area_name" TEXT NOT NULL,
    "related_sigungu_code" TEXT NOT NULL,
    "related_sigungu_name" TEXT NOT NULL,
    "related_category_large_name" TEXT,
    "related_category_medium_name" TEXT,
    "related_category_small_name" TEXT,
    "rank" INTEGER NOT NULL,
    "raw_payload" JSONB NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "related_tourism_source_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "related_tourism_source_unique_key"
ON "related_tourism_source_records"("base_ym", "tourist_spot_code", "related_tourist_spot_code");

CREATE INDEX "related_tourism_source_lookup_idx"
ON "related_tourism_source_records"("base_ym", "area_code", "sigungu_code", "tourist_spot_code", "rank");

CREATE INDEX "related_tourism_source_spot_name_idx"
ON "related_tourism_source_records"("tourist_spot_name");

CREATE INDEX "related_tourism_source_related_name_idx"
ON "related_tourism_source_records"("related_tourist_spot_name");
