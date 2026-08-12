CREATE TYPE "TransportHubCoordinateSource" AS ENUM ('legacy', 'kakao_map');

ALTER TABLE "transport_hubs"
ADD COLUMN "source_name" TEXT,
ADD COLUMN "kakao_place_id" TEXT,
ADD COLUMN "address" TEXT,
ADD COLUMN "coordinate_source" "TransportHubCoordinateSource" NOT NULL DEFAULT 'legacy',
ADD COLUMN "coordinate_verified_at" TIMESTAMP(3);

UPDATE "transport_hubs"
SET "source_name" = "name"
WHERE "source_name" IS NULL;

ALTER TABLE "transport_hubs"
ALTER COLUMN "source_name" SET NOT NULL;

CREATE INDEX "transport_hubs_coordinate_source_is_active_idx"
ON "transport_hubs"("coordinate_source", "is_active");

CREATE INDEX "transport_hubs_kakao_place_id_idx"
ON "transport_hubs"("kakao_place_id");
