import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import type { TourismCollectionProgressItem } from "@/shared/api/tourismAdmin";

const DEFAULT_MONTHS = 24;
const DEFAULT_VISITOR_DAYS = 90;
const PHOTO_PAGES_PER_JOB = 20;
const RESOURCE_METRIC_CODES = 19;
const INTENSITY_METRIC_CODES = 10;

type CollectionRun = {
  source: string;
  status: string;
  parameters: Prisma.JsonValue | null;
  errorMessage: string | null;
  startedAt: Date;
  finishedAt: Date | null;
};

type CollectionCoverage = {
  areaCount: number;
  regionCount: number;
};

type CollectionCounts = {
  places: number;
  wellness: number;
  photos: number;
  municipalCore: number;
  concentration: number;
  visitors: number;
  resourceMetrics: number;
  intensityMetrics: number;
};

type ProgressDefinition = {
  id: TourismCollectionProgressItem["id"];
  label: string;
  description: string;
  sources: string[];
  storedRecords: number;
  targetJobs: number | null;
};

export async function getTourismCollectionProgress() {
  const [
    runs,
    coverageRows,
    places,
    wellness,
    photos,
    municipalCore,
    concentration,
    visitors,
    resourceMetrics,
    intensityMetrics,
  ] = await Promise.all([
    prisma.externalDataSyncRun.findMany({
      where: { source: { startsWith: "kto" } },
      select: {
        source: true,
        status: true,
        parameters: true,
        errorMessage: true,
        startedAt: true,
        finishedAt: true,
      },
    }),
    prisma.$queryRaw<CollectionCoverage[]>`
      SELECT
        COUNT(
          DISTINCT raw_payload->>'lDongRegnCd'
        ) FILTER (
          WHERE raw_payload->>'lDongRegnCd' ~ '^[0-9]+$'
        )::int AS "areaCount",
        COUNT(
          DISTINCT concat_ws(
            ':',
            raw_payload->>'lDongRegnCd',
            raw_payload->>'lDongSignguCd'
          )
        ) FILTER (
          WHERE raw_payload->>'lDongRegnCd' ~ '^[0-9]+$'
            AND raw_payload->>'lDongSignguCd' ~ '^[0-9]+$'
        )::int AS "regionCount"
      FROM tourism_place_source_records
    `,
    prisma.tourismPlaceSourceRecord.count(),
    prisma.wellnessTourismSourceRecord.count(),
    prisma.tourismPhotoGallerySourceRecord.count(),
    prisma.municipalCoreTourismSourceRecord.count(),
    prisma.touristSpotConcentrationRateRecord.count(),
    prisma.regionalVisitorCountRecord.count(),
    prisma.tourismRegionMetric.count({
      where: {
        metricType: { in: ["serviceDemand", "culturalResourceDemand"] },
      },
    }),
    prisma.tourismRegionMetric.count({
      where: {
        metricType: { in: ["stayIntensity", "consumptionIntensity"] },
      },
    }),
  ]);
  const coverage = coverageRows[0] ?? { areaCount: 0, regionCount: 0 };
  const counts: CollectionCounts = {
    places,
    wellness,
    photos,
    municipalCore,
    concentration,
    visitors,
    resourceMetrics,
    intensityMetrics,
  };
  const photoTarget = getPhotoTarget(runs);
  const definitions: ProgressDefinition[] = [
    {
      id: "places",
      label: "국문 관광정보",
      description: "추천 후보가 되는 관광지·문화시설·코스·레포츠",
      sources: ["ktoTourismInfo"],
      storedRecords: counts.places,
      targetJobs: null,
    },
    {
      id: "wellness",
      label: "웰니스 관광",
      description: "웰니스 테마와 장소 원천 정보",
      sources: ["ktoWellnessTourism"],
      storedRecords: counts.wellness,
      targetJobs: null,
    },
    {
      id: "photos",
      label: "관광사진",
      description: "공유 가능한 관광사진 URL과 촬영 메타데이터",
      sources: ["ktoTourismPhotoGallery"],
      storedRecords: counts.photos,
      targetJobs: photoTarget,
    },
    {
      id: "municipalCore",
      label: "중심 관광지",
      description: `최근 ${DEFAULT_MONTHS}개월 · ${coverage.regionCount.toLocaleString("ko-KR")}개 시군구`,
      sources: ["ktoMunicipalCoreTourism"],
      storedRecords: counts.municipalCore,
      targetJobs: coverage.regionCount * DEFAULT_MONTHS,
    },
    {
      id: "concentration",
      label: "관광지 집중률",
      description: "시군구별 관광지 방문 집중도",
      sources: ["ktoTouristSpotConcentrationRate"],
      storedRecords: counts.concentration,
      targetJobs: coverage.regionCount,
    },
    {
      id: "visitors",
      label: "방문자 수",
      description: `최근 ${DEFAULT_VISITOR_DAYS}일 · 광역/기초 지자체`,
      sources: ["ktoRegionalVisitorCount"],
      storedRecords: counts.visitors,
      targetJobs: DEFAULT_VISITOR_DAYS * 2,
    },
    {
      id: "resourceDemand",
      label: "관광 자원 수요",
      description: `최근 ${DEFAULT_MONTHS}개월 · 서비스/문화 자원 지표`,
      sources: ["ktoRegionalResourceDemand"],
      storedRecords: counts.resourceMetrics,
      targetJobs:
        coverage.areaCount * DEFAULT_MONTHS * RESOURCE_METRIC_CODES,
    },
    {
      id: "demandIntensity",
      label: "관광 수요 강도",
      description: `최근 ${DEFAULT_MONTHS}개월 · 체류/소비 강도 지표`,
      sources: ["ktoRegionalDemandIntensity"],
      storedRecords: counts.intensityMetrics,
      targetJobs:
        coverage.areaCount * DEFAULT_MONTHS * INTENSITY_METRIC_CODES,
    },
  ];

  return definitions.map((definition) =>
    createProgressItem(definition, runs),
  );
}

function createProgressItem(
  definition: ProgressDefinition,
  allRuns: CollectionRun[],
): TourismCollectionProgressItem {
  const runs = allRuns.filter((run) =>
    definition.sources.includes(run.source),
  );
  const successfulKeys = new Set<string>();

  for (const run of runs) {
    if (run.status !== "succeeded") continue;
    const key = getRunKey(run);
    if (key) successfulKeys.add(key);
  }

  const unresolvedRuns = runs.filter((run) => {
    if (run.status !== "failed" && run.status !== "partial") return false;
    const key = getRunKey(run);
    return Boolean(key && !successfulKeys.has(key));
  });
  const unresolvedKeys = new Set(
    unresolvedRuns.flatMap((run) => {
      const key = getRunKey(run);
      return key ? [key] : [];
    }),
  );
  const latestRun = getLatestRun(runs);
  const latestSuccess = getLatestRun(
    runs.filter((run) => run.status === "succeeded"),
  );
  const latestError = getLatestRun(unresolvedRuns);
  const completedJobs =
    definition.targetJobs === null ? null : successfulKeys.size;
  const remainingJobs =
    definition.targetJobs === null || completedJobs === null
      ? null
      : Math.max(0, definition.targetJobs - completedJobs);
  const progressPercent =
    definition.targetJobs === null || completedJobs === null
      ? null
      : definition.targetJobs === 0
        ? 0
        : Math.min(
            100,
            Math.round((completedJobs / definition.targetJobs) * 1000) / 10,
          );
  const isComplete =
    definition.targetJobs === null
      ? definition.storedRecords > 0 &&
        Boolean(latestSuccess) &&
        (!latestError ||
          latestSuccess!.startedAt.getTime() >= latestError.startedAt.getTime())
      : remainingJobs === 0 && definition.targetJobs > 0;
  const isRunning = runs.some((run) => run.status === "running");
  const status: TourismCollectionProgressItem["status"] = isComplete
    ? "complete"
    : isRunning
      ? "collecting"
      : latestError?.errorMessage?.includes("HTTP 429")
        ? "quota_wait"
        : latestError
          ? "error"
          : definition.storedRecords > 0
            ? "collecting"
            : "ready";

  return {
    id: definition.id,
    label: definition.label,
    description: definition.description,
    status,
    storedRecords: definition.storedRecords,
    completedJobs,
    targetJobs: definition.targetJobs,
    remainingJobs,
    progressPercent,
    unresolvedFailures: isComplete ? 0 : unresolvedKeys.size,
    lastAttemptAt: latestRun?.startedAt.toISOString() ?? null,
    lastSuccessAt:
      latestSuccess?.finishedAt?.toISOString() ??
      latestSuccess?.startedAt.toISOString() ??
      null,
    lastError: isComplete ? null : latestError?.errorMessage ?? null,
  };
}

function getPhotoTarget(runs: CollectionRun[]) {
  const starts = runs
    .filter((run) => run.source === "ktoTourismPhotoGallery")
    .flatMap((run) => {
      const parameters = asObject(run.parameters);
      const startPage = Number(parameters?.startPage);
      return Number.isInteger(startPage) && startPage > 0 ? [startPage] : [];
    });
  const maximumStart = starts.length > 0 ? Math.max(...starts) : 0;

  return maximumStart > 0
    ? Math.floor((maximumStart - 1) / PHOTO_PAGES_PER_JOB) + 1
    : 0;
}

function getRunKey(run: CollectionRun) {
  const parameters = asObject(run.parameters);
  if (!parameters) return null;

  if (run.source === "ktoTourismPhotoGallery") {
    return joinKey(parameters.startPage);
  }
  if (run.source === "ktoMunicipalCoreTourism") {
    return joinKey(
      parameters.baseYm,
      parameters.areaCode,
      parameters.sigunguCode,
    );
  }
  if (run.source === "ktoTouristSpotConcentrationRate") {
    return joinKey(parameters.areaCode, parameters.sigunguCode);
  }
  if (run.source === "ktoRegionalVisitorCount") {
    return joinKey(parameters.aggregationLevel, parameters.baseYmd);
  }
  if (
    run.source === "ktoRegionalResourceDemand" ||
    run.source === "ktoRegionalDemandIntensity"
  ) {
    return joinKey(
      parameters.metricType,
      parameters.metricCode,
      parameters.baseYm,
      parameters.areaCode,
    );
  }
  if (run.source === "ktoTourismInfo") {
    return joinKey(
      parameters.contentTypeId,
      parameters.areaCode ?? "all",
      parameters.startPage,
    );
  }
  if (run.source === "ktoWellnessTourism") {
    return joinKey(
      parameters.wellnessThemeCode ?? "all",
      parameters.startPage ?? 1,
    );
  }

  return null;
}

function getLatestRun(runs: CollectionRun[]) {
  return runs.reduce<CollectionRun | null>(
    (latest, run) =>
      !latest || run.startedAt.getTime() > latest.startedAt.getTime()
        ? run
        : latest,
    null,
  );
}

function asObject(value: Prisma.JsonValue | null) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

function joinKey(...values: Array<Prisma.JsonValue | undefined>) {
  const normalized = values.map((value) => {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
    return null;
  });

  return normalized.some((value) => value === null)
    ? null
    : normalized.join(":");
}
