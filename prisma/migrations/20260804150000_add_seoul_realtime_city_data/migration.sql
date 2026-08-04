CREATE TABLE "seoul_realtime_areas" (
  "area_code" TEXT NOT NULL,
  "area_name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "geometry" geometry(MultiPolygon, 4326) NOT NULL,
  "source_synced_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "seoul_realtime_areas_pkey" PRIMARY KEY ("area_code")
);

CREATE TABLE "place_seoul_realtime_areas" (
  "place_id" TEXT NOT NULL,
  "area_code" TEXT NOT NULL,
  "match_method" TEXT NOT NULL DEFAULT 'contains',
  "confidence" DECIMAL(4,3) NOT NULL DEFAULT 1,
  "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "place_seoul_realtime_areas_pkey" PRIMARY KEY ("place_id")
);

CREATE TABLE "seoul_realtime_population_cache" (
  "area_code" TEXT NOT NULL,
  "area_name" TEXT NOT NULL,
  "congestion_level" TEXT NOT NULL,
  "congestion_message" TEXT,
  "population_min" INTEGER,
  "population_max" INTEGER,
  "observed_at" TIMESTAMP(3) NOT NULL,
  "forecast_payload" JSONB,
  "raw_payload" JSONB NOT NULL,
  "fetched_at" TIMESTAMP(3) NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "seoul_realtime_population_cache_pkey" PRIMARY KEY ("area_code")
);

CREATE INDEX "seoul_realtime_areas_category_idx"
  ON "seoul_realtime_areas"("category");

CREATE INDEX "seoul_realtime_areas_geometry_idx"
  ON "seoul_realtime_areas" USING GIST ("geometry");

CREATE INDEX "place_seoul_realtime_areas_area_code_idx"
  ON "place_seoul_realtime_areas"("area_code");

CREATE INDEX "seoul_realtime_population_cache_expires_at_idx"
  ON "seoul_realtime_population_cache"("expires_at");

ALTER TABLE "place_seoul_realtime_areas"
  ADD CONSTRAINT "place_seoul_realtime_areas_place_id_fkey"
  FOREIGN KEY ("place_id") REFERENCES "places"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "place_seoul_realtime_areas"
  ADD CONSTRAINT "place_seoul_realtime_areas_area_code_fkey"
  FOREIGN KEY ("area_code") REFERENCES "seoul_realtime_areas"("area_code")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "seoul_realtime_population_cache"
  ADD CONSTRAINT "seoul_realtime_population_cache_area_code_fkey"
  FOREIGN KEY ("area_code") REFERENCES "seoul_realtime_areas"("area_code")
  ON DELETE CASCADE ON UPDATE CASCADE;
