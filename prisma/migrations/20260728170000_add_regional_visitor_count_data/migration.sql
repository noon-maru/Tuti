CREATE TABLE "regional_visitor_count_records" (
    "id" TEXT NOT NULL,
    "aggregation_level" TEXT NOT NULL,
    "base_ymd" TEXT NOT NULL,
    "region_code" TEXT NOT NULL,
    "region_name" TEXT NOT NULL,
    "weekday_code" TEXT NOT NULL,
    "weekday_name" TEXT NOT NULL,
    "visitor_type_code" TEXT NOT NULL,
    "visitor_type_name" TEXT NOT NULL,
    "visitor_count" DECIMAL(20,0) NOT NULL,
    "raw_payload" JSONB NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "regional_visitor_count_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "regional_visitor_count_unique_key"
ON "regional_visitor_count_records"("aggregation_level", "base_ymd", "region_code", "weekday_code", "visitor_type_code");

CREATE INDEX "regional_visitor_count_lookup_idx"
ON "regional_visitor_count_records"("aggregation_level", "base_ymd", "region_code");

CREATE INDEX "regional_visitor_count_name_date_idx"
ON "regional_visitor_count_records"("region_name", "base_ymd");
