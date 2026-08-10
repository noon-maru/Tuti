CREATE TABLE "place_crowd_estimates" (
  "place_id" TEXT NOT NULL,
  "forecast_date" TEXT NOT NULL,
  "level" TEXT NOT NULL,
  "score" DECIMAL(5,2) NOT NULL,
  "confidence" TEXT NOT NULL,
  "visitor_pressure" DECIMAL(5,2),
  "centrality_pressure" DECIMAL(5,2),
  "regional_demand_pressure" DECIMAL(5,2),
  "basis" JSONB NOT NULL,
  "algorithm_version" TEXT NOT NULL,
  "calculated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "place_crowd_estimates_pkey"
    PRIMARY KEY ("place_id", "forecast_date")
);

CREATE INDEX "place_crowd_estimates_forecast_date_level_idx"
  ON "place_crowd_estimates"("forecast_date", "level");

CREATE INDEX "place_crowd_estimates_calculated_at_idx"
  ON "place_crowd_estimates"("calculated_at");

ALTER TABLE "place_crowd_estimates"
  ADD CONSTRAINT "place_crowd_estimates_place_id_fkey"
  FOREIGN KEY ("place_id") REFERENCES "places"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
