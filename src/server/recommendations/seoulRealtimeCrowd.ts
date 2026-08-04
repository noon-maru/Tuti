import type { Prisma } from "@/generated/prisma/client";
import type { CrowdForecast, TutiPlace } from "@/lib/recommendations";
import { prisma } from "@/server/db/prisma";
import { fetchSeoulRealtimePopulation } from "@/server/seoul/seoulRealtimePopulationClient";

const CACHE_TTL_MS = 5 * 60 * 1_000;
const STALE_CACHE_MAX_AGE_MS = 60 * 60 * 1_000;

type SeoulAreaContext = {
  placeId: string;
  areaCode: string;
  areaName: string;
};

type CacheRow = {
  areaCode: string;
  areaName: string;
  congestionLevel: string;
  congestionMessage: string | null;
  populationMin: number | null;
  populationMax: number | null;
  observedAt: Date;
  rawPayload: Prisma.JsonValue;
  fetchedAt: Date;
  expiresAt: Date;
};

const areaRequests = new Map<string, Promise<CrowdForecast | null>>();

export async function findSeoulRealtimeAreaContexts(
  places: TutiPlace[],
) {
  const placeIds = [...new Set(places.map((place) => place.id))];
  if (placeIds.length === 0) return new Map<string, SeoulAreaContext>();

  const placeIdsJson = JSON.stringify(placeIds);
  const rows = await prisma.$queryRaw<SeoulAreaContext[]>`
    SELECT
      link."place_id" AS "placeId",
      area."area_code" AS "areaCode",
      area."area_name" AS "areaName"
    FROM "place_seoul_realtime_areas" AS link
    JOIN "seoul_realtime_areas" AS area
      ON area."area_code" = link."area_code"
    WHERE link."place_id" IN (
      SELECT jsonb_array_elements_text(${placeIdsJson}::jsonb)
    )
  `;

  return new Map(rows.map((row) => [row.placeId, row]));
}

export function resolveSeoulRealtimeCrowd(
  context: SeoulAreaContext,
): Promise<CrowdForecast | null> {
  const existing = areaRequests.get(context.areaCode);
  if (existing) return existing;

  const request = resolveSeoulRealtimeCrowdOnce(context).finally(() => {
    areaRequests.delete(context.areaCode);
  });
  areaRequests.set(context.areaCode, request);
  return request;
}

async function resolveSeoulRealtimeCrowdOnce(
  context: SeoulAreaContext,
): Promise<CrowdForecast | null> {
  const cached = await readCache(context.areaCode);
  if (cached && cached.expiresAt > new Date()) {
    return cacheToForecast(cached);
  }

  try {
    const live = await fetchSeoulRealtimePopulation(context.areaCode);
    const fetchedAt = new Date();
    const expiresAt = new Date(fetchedAt.getTime() + CACHE_TTL_MS);
    const rawPayload = JSON.stringify(live.rawPayload);
    const forecastPayload = JSON.stringify(live.forecasts);

    await prisma.$executeRaw`
      INSERT INTO "seoul_realtime_population_cache" (
        "area_code",
        "area_name",
        "congestion_level",
        "congestion_message",
        "population_min",
        "population_max",
        "observed_at",
        "forecast_payload",
        "raw_payload",
        "fetched_at",
        "expires_at"
      ) VALUES (
        ${live.areaCode},
        ${live.areaName},
        ${live.congestionLevel},
        ${live.congestionMessage},
        ${live.populationMin},
        ${live.populationMax},
        ${live.observedAt},
        ${forecastPayload}::jsonb,
        ${rawPayload}::jsonb,
        ${fetchedAt},
        ${expiresAt}
      )
      ON CONFLICT ("area_code") DO UPDATE SET
        "area_name" = EXCLUDED."area_name",
        "congestion_level" = EXCLUDED."congestion_level",
        "congestion_message" = EXCLUDED."congestion_message",
        "population_min" = EXCLUDED."population_min",
        "population_max" = EXCLUDED."population_max",
        "observed_at" = EXCLUDED."observed_at",
        "forecast_payload" = EXCLUDED."forecast_payload",
        "raw_payload" = EXCLUDED."raw_payload",
        "fetched_at" = EXCLUDED."fetched_at",
        "expires_at" = EXCLUDED."expires_at"
    `;

    return toForecast({
      areaName: live.areaName,
      congestionLevel: live.congestionLevel,
      congestionMessage: live.congestionMessage,
      observedAt: live.observedAt,
      source: "live",
    });
  } catch (error) {
    if (
      cached &&
      Date.now() - cached.fetchedAt.getTime() <= STALE_CACHE_MAX_AGE_MS
    ) {
      return cacheToForecast(cached, "cached");
    }
    console.warn("서울 실시간 혼잡도를 불러오지 못했습니다.", {
      areaCode: context.areaCode,
      error: error instanceof Error ? error.name : "UnknownError",
    });
    return null;
  }
}

async function readCache(areaCode: string) {
  const rows = await prisma.$queryRaw<CacheRow[]>`
    SELECT
      "area_code" AS "areaCode",
      "area_name" AS "areaName",
      "congestion_level" AS "congestionLevel",
      "congestion_message" AS "congestionMessage",
      "population_min" AS "populationMin",
      "population_max" AS "populationMax",
      "observed_at" AS "observedAt",
      "raw_payload" AS "rawPayload",
      "fetched_at" AS "fetchedAt",
      "expires_at" AS "expiresAt"
    FROM "seoul_realtime_population_cache"
    WHERE "area_code" = ${areaCode}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

function cacheToForecast(
  cached: CacheRow,
  source: CrowdForecast["source"] = "live",
) {
  return toForecast({
    areaName: cached.areaName,
    congestionLevel: cached.congestionLevel,
    congestionMessage: cached.congestionMessage,
    observedAt: cached.observedAt,
    source,
  });
}

function toForecast({
  areaName,
  congestionLevel,
  congestionMessage,
  observedAt,
  source,
}: {
  areaName: string;
  congestionLevel: string;
  congestionMessage: string | null;
  observedAt: Date;
  source: CrowdForecast["source"];
}): CrowdForecast {
  const normalized = normalizeCongestionLevel(congestionLevel);
  return {
    provider: "seoul_citydata",
    source,
    level: normalized.level,
    rate: normalized.score,
    label: normalized.label,
    areaName,
    observedAt: observedAt.toISOString(),
    ...(congestionMessage ? { message: congestionMessage } : {}),
  };
}

function normalizeCongestionLevel(value: string) {
  if (value === "여유") {
    return { level: "low" as const, score: 20, label: value };
  }
  if (value === "보통") {
    return { level: "medium" as const, score: 50, label: value };
  }
  if (value === "약간 붐빔") {
    return { level: "high" as const, score: 75, label: value };
  }
  return { level: "high" as const, score: 95, label: value || "붐빔" };
}
