ALTER TABLE "places"
ADD COLUMN "source_area_code" TEXT,
ADD COLUMN "source_sigungu_code" TEXT;

CREATE TABLE "tourism_place_source_records" (
  "content_id" TEXT NOT NULL,
  "content_type_id" TEXT,
  "title" TEXT NOT NULL,
  "area_code" TEXT,
  "sigungu_code" TEXT,
  "raw_payload" JSONB NOT NULL,
  "linked_place_id" TEXT,
  "source_modified_at" TIMESTAMP(3),
  "synced_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "tourism_place_source_records_pkey" PRIMARY KEY ("content_id")
);

CREATE UNIQUE INDEX "tourism_place_source_records_linked_place_id_key"
ON "tourism_place_source_records"("linked_place_id");

CREATE INDEX "tourism_place_source_records_content_type_id_synced_at_idx"
ON "tourism_place_source_records"("content_type_id", "synced_at");

CREATE INDEX "tourism_place_source_records_area_code_sigungu_code_idx"
ON "tourism_place_source_records"("area_code", "sigungu_code");

ALTER TABLE "tourism_place_source_records"
ADD CONSTRAINT "tourism_place_source_records_linked_place_id_fkey"
FOREIGN KEY ("linked_place_id") REFERENCES "places"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "tourism_region_metrics" (
  "id" TEXT NOT NULL,
  "dataset" TEXT NOT NULL,
  "metric_type" TEXT NOT NULL,
  "metric_code" TEXT NOT NULL,
  "metric_name" TEXT NOT NULL,
  "metric_value" DECIMAL(20, 4),
  "base_ym" TEXT NOT NULL,
  "area_code" TEXT NOT NULL,
  "area_name" TEXT NOT NULL,
  "sigungu_code" TEXT NOT NULL,
  "sigungu_name" TEXT NOT NULL,
  "raw_payload" JSONB NOT NULL,
  "synced_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "tourism_region_metrics_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tourism_region_metrics_metric_type_metric_code_base_ym_area_code_sigungu_code_key"
ON "tourism_region_metrics"(
  "metric_type",
  "metric_code",
  "base_ym",
  "area_code",
  "sigungu_code"
);

CREATE INDEX "tourism_region_metrics_dataset_base_ym_idx"
ON "tourism_region_metrics"("dataset", "base_ym");

CREATE INDEX "tourism_region_metrics_area_code_sigungu_code_base_ym_idx"
ON "tourism_region_metrics"("area_code", "sigungu_code", "base_ym");

CREATE TABLE "external_data_sync_runs" (
  "id" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "parameters" JSONB,
  "received_count" INTEGER NOT NULL DEFAULT 0,
  "created_count" INTEGER NOT NULL DEFAULT 0,
  "updated_count" INTEGER NOT NULL DEFAULT 0,
  "skipped_count" INTEGER NOT NULL DEFAULT 0,
  "failed_count" INTEGER NOT NULL DEFAULT 0,
  "error_message" TEXT,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMP(3),

  CONSTRAINT "external_data_sync_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "external_data_sync_runs_source_started_at_idx"
ON "external_data_sync_runs"("source", "started_at");

CREATE INDEX "external_data_sync_runs_status_started_at_idx"
ON "external_data_sync_runs"("status", "started_at");
