CREATE TABLE "municipal_core_tourism_source_records" (
    "id" TEXT NOT NULL,
    "base_ym" TEXT NOT NULL,
    "area_code" TEXT NOT NULL,
    "area_name" TEXT NOT NULL,
    "sigungu_code" TEXT NOT NULL,
    "sigungu_name" TEXT NOT NULL,
    "tourist_spot_code" TEXT NOT NULL,
    "tourist_spot_name" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "category_large_name" TEXT,
    "category_medium_name" TEXT,
    "longitude" DECIMAL(11,8),
    "latitude" DECIMAL(10,8),
    "raw_payload" JSONB NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "municipal_core_tourism_source_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "municipal_core_tourism_source_unique_key"
ON "municipal_core_tourism_source_records"("base_ym", "area_code", "sigungu_code", "tourist_spot_code");

CREATE INDEX "municipal_core_tourism_source_lookup_idx"
ON "municipal_core_tourism_source_records"("base_ym", "area_code", "sigungu_code", "rank");

CREATE INDEX "municipal_core_tourism_source_name_idx"
ON "municipal_core_tourism_source_records"("tourist_spot_name");
