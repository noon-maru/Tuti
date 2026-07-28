CREATE TABLE "tourist_spot_concentration_rate_records" (
    "id" TEXT NOT NULL,
    "base_ymd" TEXT NOT NULL,
    "area_code" TEXT NOT NULL,
    "area_name" TEXT NOT NULL,
    "sigungu_code" TEXT NOT NULL,
    "sigungu_name" TEXT NOT NULL,
    "tourist_spot_name" TEXT NOT NULL,
    "concentration_rate" DECIMAL(10,4) NOT NULL,
    "raw_payload" JSONB NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tourist_spot_concentration_rate_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tourist_spot_concentration_unique_key"
ON "tourist_spot_concentration_rate_records"("base_ymd", "area_code", "sigungu_code", "tourist_spot_name");

CREATE INDEX "tourist_spot_concentration_area_date_idx"
ON "tourist_spot_concentration_rate_records"("area_code", "sigungu_code", "base_ymd");

CREATE INDEX "tourist_spot_concentration_name_date_idx"
ON "tourist_spot_concentration_rate_records"("tourist_spot_name", "base_ymd");
