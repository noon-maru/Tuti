import { prisma } from "@/server/db/prisma";

type CrowdCoverageRow = {
  totalPlaces: bigint;
  realtimePlaces: bigint;
  ktoForecastPlaces: bigint;
  tutiEstimatePlaces: bigint;
  unavailablePlaces: bigint;
};

export async function getCrowdCoverageOverview() {
  const today = getKoreanDateKey();
  const [rows, estimateSummary, concentrationSummary] = await Promise.all([
    prisma.$queryRaw<CrowdCoverageRow[]>`
      WITH recommendable_places AS (
        SELECT place."id", place."name"
        FROM "places" AS place
        WHERE place."source" = 'tourapi'
          AND (
            place."candidate_override"::text = 'include'
            OR (
              place."candidate_override"::text = 'auto'
              AND place."candidate_status"::text = 'selected'
            )
          )
      ),
      core_contexts AS (
        SELECT DISTINCT
          core."area_code",
          core."sigungu_code",
          core."tourist_spot_name"
        FROM "municipal_core_tourism_source_records" AS core
      ),
      kto_covered_names AS (
        SELECT DISTINCT context."tourist_spot_name"
        FROM core_contexts AS context
        JOIN "tourist_spot_concentration_rate_records" AS concentration
          ON concentration."area_code" = context."area_code"
          AND concentration."sigungu_code" = context."sigungu_code"
          AND concentration."tourist_spot_name" = context."tourist_spot_name"
        GROUP BY
          context."area_code",
          context."sigungu_code",
          context."tourist_spot_name"
        HAVING
          BOOL_OR(
            concentration."base_ymd" >= ${today}
            AND concentration."synced_at" >= NOW() - INTERVAL '8 days'
          )
          OR COUNT(*) FILTER (
            WHERE EXTRACT(
              DOW FROM TO_DATE(concentration."base_ymd", 'YYYYMMDD')
            ) = EXTRACT(DOW FROM TO_DATE(${today}, 'YYYYMMDD'))
          ) >= 3
      ),
      coverage_flags AS (
        SELECT
          place."id",
          realtime."place_id" IS NOT NULL AS "hasRealtime",
          kto."tourist_spot_name" IS NOT NULL AS "hasKtoForecast",
          estimate."place_id" IS NOT NULL AS "hasTutiEstimate"
        FROM recommendable_places AS place
        LEFT JOIN "place_seoul_realtime_areas" AS realtime
          ON realtime."place_id" = place."id"
        LEFT JOIN kto_covered_names AS kto
          ON kto."tourist_spot_name" = place."name"
        LEFT JOIN "place_crowd_estimates" AS estimate
          ON estimate."place_id" = place."id"
          AND estimate."forecast_date" = ${today}
      )
      SELECT
        COUNT(*) AS "totalPlaces",
        COUNT(*) FILTER (WHERE "hasRealtime") AS "realtimePlaces",
        COUNT(*) FILTER (
          WHERE NOT "hasRealtime" AND "hasKtoForecast"
        ) AS "ktoForecastPlaces",
        COUNT(*) FILTER (
          WHERE NOT "hasRealtime"
            AND NOT "hasKtoForecast"
            AND "hasTutiEstimate"
        ) AS "tutiEstimatePlaces",
        COUNT(*) FILTER (
          WHERE NOT "hasRealtime"
            AND NOT "hasKtoForecast"
            AND NOT "hasTutiEstimate"
        ) AS "unavailablePlaces"
      FROM coverage_flags
    `,
    prisma.placeCrowdEstimate.aggregate({
      _max: { calculatedAt: true },
    }),
    prisma.touristSpotConcentrationRateRecord.aggregate({
      _max: { syncedAt: true },
    }),
  ]);
  const row = rows[0];
  const totalPlaces = Number(row?.totalPlaces ?? 0);
  const realtimePlaces = Number(row?.realtimePlaces ?? 0);
  const ktoForecastPlaces = Number(row?.ktoForecastPlaces ?? 0);
  const tutiEstimatePlaces = Number(row?.tutiEstimatePlaces ?? 0);
  const unavailablePlaces = Number(row?.unavailablePlaces ?? 0);
  const coveredPlaces = totalPlaces - unavailablePlaces;

  return {
    totalPlaces,
    coveredPlaces,
    coveragePercent:
      totalPlaces > 0 ? Math.round((coveredPlaces / totalPlaces) * 1_000) / 10 : 0,
    realtimePlaces,
    ktoForecastPlaces,
    tutiEstimatePlaces,
    unavailablePlaces,
    estimateCalculatedAt:
      estimateSummary._max.calculatedAt?.toISOString() ?? null,
    concentrationSyncedAt:
      concentrationSummary._max.syncedAt?.toISOString() ?? null,
  };
}

function getKoreanDateKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${value("year")}${value("month")}${value("day")}`;
}
