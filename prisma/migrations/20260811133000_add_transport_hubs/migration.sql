CREATE TYPE "TransportHubMode" AS ENUM ('rail', 'express_bus');

CREATE TABLE "transport_hubs" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "mode" "TransportHubMode" NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "city_code" TEXT,
    "region_name" TEXT,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "raw_payload" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "source_synced_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transport_hubs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "transport_hubs_source_external_id_key"
ON "transport_hubs"("source", "external_id");

CREATE INDEX "transport_hubs_mode_is_active_idx"
ON "transport_hubs"("mode", "is_active");

CREATE INDEX "transport_hubs_city_code_idx"
ON "transport_hubs"("city_code");
