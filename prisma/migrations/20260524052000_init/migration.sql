CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TYPE "MovementLevel" AS ENUM ('near', 'short', 'half');

CREATE TABLE "places" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phrase" TEXT NOT NULL,
  "note" TEXT NOT NULL,
  "image" TEXT NOT NULL,
  "travel_time" TEXT NOT NULL,
  "crowd" TEXT NOT NULL,
  "today" TEXT NOT NULL,
  "fatigue" INTEGER NOT NULL,
  "movement_level" "MovementLevel" NOT NULL,
  "mood_tags" TEXT[] NOT NULL,
  "latitude" DECIMAL(9, 6) NOT NULL,
  "longitude" DECIMAL(9, 6) NOT NULL,
  "location" geometry(Point, 4326),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "places_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "places_fatigue_idx" ON "places"("fatigue");
CREATE INDEX "places_movement_level_idx" ON "places"("movement_level");
CREATE INDEX "places_location_idx" ON "places" USING GIST ("location");
