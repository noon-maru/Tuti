import type { Prisma } from "../src/generated/prisma/client";
import { prisma } from "../src/server/db/prisma";
import { recommendablePlaceWhere } from "../src/server/recommendations/recommendablePlaceWhere";

const ALGORITHM_VERSION = "regional-pattern-v1";
const DEFAULT_DAYS = 8;
const VISITOR_HISTORY_DAYS = 180;
const BATCH_SIZE = 100;

const options = parseOptions(process.argv.slice(2));

try {
  const calculatedAt = new Date();
  const targetDates = createKoreanDateRange(options.days);
  const oldestVisitorDate = formatDateKey(
    addDays(parseDateKey(targetDates[0]), -VISITOR_HISTORY_DAYS),
  );

  const [places, latestCoreMonth, latestMetricMonth] = await Promise.all([
    prisma.place.findMany({
      where: recommendablePlaceWhere,
      select: {
        id: true,
        name: true,
        sourceSidoName: true,
        sourceSigunguName: true,
      },
      orderBy: { id: "asc" },
    }),
    prisma.municipalCoreTourismSourceRecord.aggregate({
      _max: { baseYm: true },
    }),
    prisma.tourismRegionMetric.aggregate({ _max: { baseYm: true } }),
  ]);

  const [visitorRows, coreRows, metricRows] = await Promise.all([
    prisma.regionalVisitorCountRecord.findMany({
      where: { baseYmd: { gte: oldestVisitorDate } },
      select: {
        aggregationLevel: true,
        baseYmd: true,
        regionName: true,
        visitorCount: true,
        rawPayload: true,
      },
    }),
    latestCoreMonth._max.baseYm
      ? prisma.municipalCoreTourismSourceRecord.findMany({
          where: { baseYm: latestCoreMonth._max.baseYm },
          select: {
            touristSpotName: true,
            areaName: true,
            sigunguName: true,
            rank: true,
          },
        })
      : [],
    latestMetricMonth._max.baseYm
      ? prisma.tourismRegionMetric.findMany({
          where: {
            baseYm: latestMetricMonth._max.baseYm,
            metricValue: { not: null },
          },
          select: {
            metricType: true,
            metricCode: true,
            metricValue: true,
            areaName: true,
            sigunguName: true,
          },
        })
      : [],
  ]);

  const visitorProfiles = buildVisitorProfiles(visitorRows);
  const centralityByPlace = buildCentralityProfiles(coreRows);
  const regionalDemand = buildRegionalDemandProfiles(metricRows);
  const estimates: Array<{
    placeId: string;
    forecastDate: string;
    level: "low" | "medium" | "high";
    score: number;
    confidence: "medium" | "low";
    visitorPressure: number | null;
    centralityPressure: number | null;
    regionalDemandPressure: number | null;
    basis: Prisma.InputJsonValue;
  }> = [];

  for (const place of places) {
    const visitor = findVisitorProfile(place, visitorProfiles);
    const centrality = findCentrality(place, centralityByPlace);
    const demand = findRegionalValue(place, regionalDemand);

    for (const forecastDate of targetDates) {
      const visitorPressure = visitor
        ? scoreVisitorPressure(visitor, weekdayOf(forecastDate))
        : null;
      const components = ([
        visitorPressure
          ? { key: "visitor", weight: 0.55, value: visitorPressure.value }
          : null,
        centrality !== undefined
          ? { key: "centrality", weight: 0.25, value: centrality }
          : null,
        demand !== undefined
          ? { key: "demand", weight: 0.2, value: demand }
          : null,
      ] satisfies Array<WeightedComponent | null>).filter(
        (value): value is WeightedComponent => value !== null,
      );

      if (components.length === 0) continue;

      const totalWeight = components.reduce(
        (sum, component) => sum + component.weight,
        0,
      );
      const score = clamp(
        components.reduce(
          (sum, component) => sum + component.value * component.weight,
          0,
        ) / totalWeight,
        0,
        100,
      );
      const confidence =
        visitorPressure && components.length >= 2 ? "medium" : "low";

      estimates.push({
        placeId: place.id,
        forecastDate,
        level: score <= 35 ? "low" : score <= 70 ? "medium" : "high",
        score: round(score),
        confidence,
        visitorPressure: visitorPressure
          ? round(visitorPressure.value)
          : null,
        centralityPressure:
          centrality !== undefined ? round(centrality) : null,
        regionalDemandPressure: demand !== undefined ? round(demand) : null,
        basis: {
          visitorSampleCount: visitorPressure?.sampleCount ?? 0,
          coreBaseYm: latestCoreMonth._max.baseYm,
          metricBaseYm: latestMetricMonth._max.baseYm,
          components: components.map(({ key, weight, value }) => ({
            key,
            weight,
            value: round(value),
          })),
        } satisfies Prisma.InputJsonValue,
      });
    }
  }

  for (let index = 0; index < estimates.length; index += BATCH_SIZE) {
    const batch = estimates.slice(index, index + BATCH_SIZE);
    await prisma.$transaction(
      batch.map((estimate) =>
        prisma.placeCrowdEstimate.upsert({
          where: {
            placeId_forecastDate: {
              placeId: estimate.placeId,
              forecastDate: estimate.forecastDate,
            },
          },
          update: {
            level: estimate.level,
            score: estimate.score,
            confidence: estimate.confidence,
            visitorPressure: estimate.visitorPressure,
            centralityPressure: estimate.centralityPressure,
            regionalDemandPressure: estimate.regionalDemandPressure,
            basis: estimate.basis,
            algorithmVersion: ALGORITHM_VERSION,
            calculatedAt,
          },
          create: {
            ...estimate,
            algorithmVersion: ALGORITHM_VERSION,
            calculatedAt,
          },
        }),
      ),
    );
  }

  const deleted = await prisma.placeCrowdEstimate.deleteMany({
    where: { forecastDate: { lt: targetDates[0] } },
  });
  const deletedOutsidePool = places.length
    ? await prisma.placeCrowdEstimate.deleteMany({
        where: { placeId: { notIn: places.map((place) => place.id) } },
      })
    : { count: 0 };

  console.log(
    JSON.stringify(
      {
        algorithmVersion: ALGORITHM_VERSION,
        places: places.length,
        targetDays: targetDates.length,
        estimates: estimates.length,
        deletedExpired: deleted.count,
        deletedOutsidePool: deletedOutsidePool.count,
        latestCoreMonth: latestCoreMonth._max.baseYm,
        latestMetricMonth: latestMetricMonth._max.baseYm,
      },
      null,
      2,
    ),
  );
} finally {
  await prisma.$disconnect();
}

type VisitorRow = {
  aggregationLevel: string;
  baseYmd: string;
  regionName: string;
  visitorCount: { toString(): string };
  rawPayload: Prisma.JsonValue;
};

type VisitorProfile = Map<number, number[]>;
type WeightedComponent = {
  key: "visitor" | "centrality" | "demand";
  weight: number;
  value: number;
};

function buildVisitorProfiles(rows: VisitorRow[]) {
  const dailyTotals = new Map<string, number>();

  for (const row of rows) {
    const count = Number(row.visitorCount);
    if (!Number.isFinite(count)) continue;
    const raw = asRecord(row.rawPayload);
    const areaName = readString(raw?.areaNm) ?? readString(raw?.areaName);
    const region = row.aggregationLevel === "municipal"
      ? regionKey(areaName, row.regionName)
      : normalizeSido(row.regionName);
    const key = [row.aggregationLevel, region, row.baseYmd].join("\u0000");
    dailyTotals.set(key, (dailyTotals.get(key) ?? 0) + count);
  }

  const profiles = new Map<string, VisitorProfile>();
  for (const [key, total] of dailyTotals) {
    const [aggregationLevel, regionName, baseYmd] = key.split("\u0000");
    const profileKey = `${aggregationLevel}:${regionName}`;
    const profile = profiles.get(profileKey) ?? new Map<number, number[]>();
    const weekday = weekdayOf(baseYmd);
    const values = profile.get(weekday) ?? [];
    values.push(total);
    profile.set(weekday, values);
    profiles.set(profileKey, profile);
  }
  return profiles;
}

function buildCentralityProfiles(
  rows: Array<{
    touristSpotName: string;
    areaName: string;
    sigunguName: string;
    rank: number;
  }>,
) {
  const values = new Map<string, number>();
  for (const row of rows) {
    const score = clamp(100 - ((Math.max(1, row.rank) - 1) / 99) * 100, 0, 100);
    const name = normalizeName(row.touristSpotName);
    const regionalKey = `${name}:${regionKey(row.areaName, row.sigunguName)}`;
    values.set(regionalKey, Math.max(values.get(regionalKey) ?? 0, score));
    values.set(name, Math.max(values.get(name) ?? 0, score));
  }
  return values;
}

function buildRegionalDemandProfiles(
  rows: Array<{
    metricType: string;
    metricCode: string;
    metricValue: { toString(): string } | null;
    areaName: string;
    sigunguName: string;
  }>,
) {
  const groups = new Map<string, Array<{ region: string; value: number }>>();
  for (const row of rows) {
    const value = Number(row.metricValue);
    if (!Number.isFinite(value)) continue;
    const key = `${row.metricType}:${row.metricCode}`;
    const values = groups.get(key) ?? [];
    values.push({ region: regionKey(row.areaName, row.sigunguName), value });
    groups.set(key, values);
  }

  const scores = new Map<string, number[]>();
  for (const values of groups.values()) {
    const sorted = [...values].sort((left, right) => left.value - right.value);
    for (const value of values) {
      const rank = sorted.findIndex((candidate) => candidate.value >= value.value);
      const percentile = sorted.length <= 1 ? 50 : (rank / (sorted.length - 1)) * 100;
      const regionScores = scores.get(value.region) ?? [];
      regionScores.push(percentile);
      scores.set(value.region, regionScores);

      const sido = value.region.split(":", 1)[0];
      const sidoScores = scores.get(sido) ?? [];
      sidoScores.push(percentile);
      scores.set(sido, sidoScores);
    }
  }

  return new Map(
    [...scores].map(([region, values]) => [
      region,
      values.reduce((sum, value) => sum + value, 0) / values.length,
    ]),
  );
}

function findVisitorProfile(
  place: { sourceSidoName: string | null; sourceSigunguName: string | null },
  profiles: Map<string, VisitorProfile>,
) {
  const municipal = place.sourceSigunguName
    ? profiles.get(
        `municipal:${regionKey(place.sourceSidoName, place.sourceSigunguName)}`,
      )
    : undefined;
  if (municipal) return municipal;
  return place.sourceSidoName
    ? profiles.get(`metropolitan:${normalizeSido(place.sourceSidoName)}`)
    : undefined;
}

function findRegionalValue(
  place: { sourceSidoName: string | null; sourceSigunguName: string | null },
  values: Map<string, number>,
) {
  if (place.sourceSigunguName) {
    const municipal = values.get(
      regionKey(place.sourceSidoName, place.sourceSigunguName),
    );
    if (municipal !== undefined) return municipal;
  }
  return place.sourceSidoName
    ? values.get(normalizeSido(place.sourceSidoName))
    : undefined;
}

function findCentrality(
  place: {
    name: string;
    sourceSidoName: string | null;
    sourceSigunguName: string | null;
  },
  values: Map<string, number>,
) {
  const name = normalizeName(place.name);
  const regional = values.get(
    `${name}:${regionKey(place.sourceSidoName, place.sourceSigunguName)}`,
  );
  return regional ?? values.get(name);
}

function scoreVisitorPressure(profile: VisitorProfile, weekday: number) {
  const weekdayAverages = [...profile.entries()]
    .map(([day, values]) => ({
      day,
      value: values.reduce((sum, value) => sum + value, 0) / values.length,
      sampleCount: values.length,
    }))
    .sort((left, right) => left.value - right.value);
  const target = weekdayAverages.find((value) => value.day === weekday);
  if (!target || target.sampleCount < 3) return null;
  const rank = weekdayAverages.findIndex((value) => value.day === weekday);
  return {
    value:
      weekdayAverages.length <= 1
        ? 50
        : (rank / (weekdayAverages.length - 1)) * 100,
    sampleCount: target.sampleCount,
  };
}

function createKoreanDateRange(days: number) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((value) => value.type === type)?.value ?? "";
  const today = `${part("year")}${part("month")}${part("day")}`;
  const start = parseDateKey(today);
  return Array.from({ length: days }, (_, index) =>
    formatDateKey(addDays(start, index)),
  );
}

function parseDateKey(value: string) {
  return new Date(
    Date.UTC(
      Number(value.slice(0, 4)),
      Number(value.slice(4, 6)) - 1,
      Number(value.slice(6, 8)),
    ),
  );
}

function formatDateKey(date: Date) {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function weekdayOf(value: string) {
  return parseDateKey(value).getUTCDay();
}

function normalizeName(value: string) {
  return value.replace(/\s+/g, "").toLowerCase();
}

function normalizeSido(value: string) {
  return value
    .replace(/\s+/g, "")
    .replace(/특별자치도|특별자치시|특별시|광역시|도$/g, "")
    .toLowerCase();
}

function normalizeRegion(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, "").toLowerCase();
}

function regionKey(
  sidoName: string | null | undefined,
  sigunguName: string | null | undefined,
) {
  return `${normalizeSido(sidoName ?? "")}:${normalizeRegion(sigunguName)}`;
}

function asRecord(value: Prisma.JsonValue) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

function readString(value: Prisma.JsonValue | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function parseOptions(args: string[]) {
  const normalized = args.filter((argument) => argument !== "--");
  const daysIndex = normalized.indexOf("--days");
  const rawDays = daysIndex >= 0 ? normalized[daysIndex + 1] : undefined;
  const days = rawDays === undefined ? DEFAULT_DAYS : Number(rawDays);
  if (!Number.isInteger(days) || days < 1 || days > 60) {
    throw new Error("--days는 1~60 범위의 정수여야 합니다.");
  }
  return { days };
}
