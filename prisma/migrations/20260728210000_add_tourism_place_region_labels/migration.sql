ALTER TABLE "places"
ADD COLUMN "source_sido_name" TEXT,
ADD COLUMN "source_sigungu_name" TEXT;

ALTER TABLE "tourism_place_source_records"
ADD COLUMN "sido_name" TEXT,
ADD COLUMN "sigungu_name" TEXT;

CREATE INDEX "tourism_place_source_records_sido_sigungu_idx"
ON "tourism_place_source_records"("sido_name", "sigungu_name");
