CREATE TABLE "wellness_tourism_source_records" (
    "id" TEXT NOT NULL,
    "content_id" TEXT NOT NULL,
    "content_type_id" TEXT,
    "lang_div_cd" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "wellness_theme_code" TEXT,
    "area_code" TEXT,
    "sigungu_code" TEXT,
    "raw_payload" JSONB NOT NULL,
    "source_modified_at" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wellness_tourism_source_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "wellness_tourism_source_records_content_id_lang_div_cd_key"
ON "wellness_tourism_source_records"("content_id", "lang_div_cd");

CREATE INDEX "wellness_tourism_source_records_wellness_theme_code_synced_at_idx"
ON "wellness_tourism_source_records"("wellness_theme_code", "synced_at");

CREATE INDEX "wellness_tourism_source_records_area_code_sigungu_code_idx"
ON "wellness_tourism_source_records"("area_code", "sigungu_code");
