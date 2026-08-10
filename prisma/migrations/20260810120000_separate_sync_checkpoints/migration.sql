CREATE TABLE "external_data_sync_checkpoints" (
  "source" TEXT NOT NULL,
  "job_key" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "parameters" JSONB,
  "completed_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "external_data_sync_checkpoints_pkey"
    PRIMARY KEY ("source", "job_key")
);

CREATE INDEX "external_data_sync_checkpoints_source_completed_at_idx"
ON "external_data_sync_checkpoints"("source", "completed_at");

WITH successful_runs AS (
  SELECT
    "source",
    "operation",
    "parameters",
    COALESCE("finished_at", "started_at") AS "completed_at",
    CASE
      WHEN "source" = 'ktoTourismPhotoGallery'
        AND "parameters"->>'startPage' IS NOT NULL
        THEN "parameters"->>'startPage'
      WHEN "source" = 'ktoMunicipalCoreTourism'
        AND "parameters"->>'baseYm' IS NOT NULL
        AND "parameters"->>'areaCode' IS NOT NULL
        AND "parameters"->>'sigunguCode' IS NOT NULL
        THEN concat_ws(
          ':',
          "parameters"->>'baseYm',
          "parameters"->>'areaCode',
          "parameters"->>'sigunguCode'
        )
      WHEN "source" = 'ktoTouristSpotConcentrationRate'
        AND "parameters"->>'areaCode' IS NOT NULL
        AND "parameters"->>'sigunguCode' IS NOT NULL
        THEN concat_ws(
          ':',
          "parameters"->>'areaCode',
          "parameters"->>'sigunguCode'
        )
      WHEN "source" = 'ktoRegionalVisitorCount'
        AND "parameters"->>'aggregationLevel' IS NOT NULL
        AND "parameters"->>'baseYmd' IS NOT NULL
        THEN concat_ws(
          ':',
          "parameters"->>'aggregationLevel',
          "parameters"->>'baseYmd'
        )
      WHEN "source" IN (
        'ktoRegionalResourceDemand',
        'ktoRegionalDemandIntensity'
      )
        AND "parameters"->>'metricType' IS NOT NULL
        AND "parameters"->>'metricCode' IS NOT NULL
        AND "parameters"->>'baseYm' IS NOT NULL
        AND "parameters"->>'areaCode' IS NOT NULL
        THEN concat_ws(
          ':',
          "parameters"->>'metricType',
          "parameters"->>'metricCode',
          "parameters"->>'baseYm',
          "parameters"->>'areaCode'
        )
      WHEN "source" = 'ktoTourismInfo'
        THEN concat_ws(
          ':',
          COALESCE("parameters"->>'contentTypeId', 'all'),
          COALESCE("parameters"->>'areaCode', 'all'),
          COALESCE("parameters"->>'startPage', '1')
        )
      WHEN "source" = 'ktoWellnessTourism'
        THEN concat_ws(
          ':',
          COALESCE("parameters"->>'wellnessThemeCode', 'all'),
          COALESCE("parameters"->>'startPage', '1')
        )
      ELSE NULL
    END AS "job_key"
  FROM "external_data_sync_runs"
  WHERE "status" = 'succeeded'
), latest_checkpoints AS (
  SELECT DISTINCT ON ("source", "job_key")
    "source",
    "job_key",
    "operation",
    "parameters",
    "completed_at"
  FROM successful_runs
  WHERE "job_key" IS NOT NULL
  ORDER BY "source", "job_key", "completed_at" DESC
)
INSERT INTO "external_data_sync_checkpoints" (
  "source",
  "job_key",
  "operation",
  "parameters",
  "completed_at"
)
SELECT
  "source",
  "job_key",
  "operation",
  "parameters",
  "completed_at"
FROM latest_checkpoints;
