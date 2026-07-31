import type { Prisma } from "../src/generated/prisma/client";
import { prisma } from "../src/server/db/prisma";
import { fetchMunicipalCoreTourism } from "../src/server/tourism/municipalCoreTourismApiClient";
import {
  fetchRegionalTourismMetrics,
  type RegionalMetricType,
} from "../src/server/tourism/regionalTourismApiClient";
import {
  fetchRegionalVisitorCounts,
  type VisitorAggregationLevel,
} from "../src/server/tourism/regionalVisitorCountApiClient";
import { syncMunicipalCoreTourism } from "../src/server/tourism/syncMunicipalCoreTourism";
import { syncRegionalTourismMetrics } from "../src/server/tourism/syncRegionalTourismMetrics";
import { syncRegionalVisitorCounts } from "../src/server/tourism/syncRegionalVisitorCounts";
import { syncTourismPhotoGallery } from "../src/server/tourism/syncTourismPhotoGallery";
import { syncTouristSpotConcentrationRates } from "../src/server/tourism/syncTouristSpotConcentrationRates";
import { syncWellnessTourism } from "../src/server/tourism/syncWellnessTourism";
import { fetchTourismPhotoGalleryRecords } from "../src/server/tourism/tourismPhotoGalleryApiClient";

const PAGE_SIZE = 100;
const PAGES_PER_JOB = 20;
const DEFAULT_MONTHS = 24;
const DEFAULT_VISITOR_DAYS = 90;
const DEFAULT_CONCURRENCY = 2;
const MAX_TRANSIENT_ATTEMPTS = 3;
const STALE_RUN_MINUTES = 60;

const metricDefinitions: ReadonlyArray<{
  type: RegionalMetricType;
  codes: readonly string[];
}> = [
  {
    type: "serviceDemand",
    codes: ["11", "1101", "1102", "1103", "1104", "1105", "1106", "1107", "1108", "1109", "1110", "1111", "1112"],
  },
  {
    type: "culturalResourceDemand",
    codes: ["12", "1201", "1202", "1203", "1204", "1205"],
  },
  {
    type: "stayIntensity",
    codes: ["21", "2101", "2102", "2103", "2104", "2105"],
  },
  {
    type: "consumptionIntensity",
    codes: ["22", "2201", "2202", "2203"],
  },
];

type Region = {
  areaCode: string;
  sigunguCode: string;
};

type CollectionOptions = {
  months: number;
  visitorDays: number;
  concurrency: number;
};

type JobResult = {
  label: string;
  status: "completed" | "skipped" | "failed";
  received?: number;
  failed?: number;
  error?: string;
};

const options = parseOptions(process.argv.slice(2));
const results: JobResult[] = [];

try {
  const staleRuns = await failStaleSyncRuns();
  if (staleRuns > 0) {
    console.log(`중단된 이전 동기화 ${staleRuns}건을 실패 상태로 정리했습니다.`);
  }

  const regions = await loadRegions();
  const areaCodes = [...new Set(regions.map((region) => region.areaCode))].sort();

  if (regions.length === 0) {
    throw new Error(
      "TourAPI 원천 데이터에서 법정동 시도·시군구 코드를 찾지 못했습니다. 장소 전수 수집을 먼저 실행해주세요.",
    );
  }

  console.log(
    `관광 공공데이터 통합 수집을 시작합니다: ${regions.length}개 시군구, ${areaCodes.length}개 시도, 동시 작업 ${options.concurrency}개`,
  );

  await runStage("웰니스 관광정보", async () => {
    const value = await syncWellnessTourism({
      startPage: 1,
      maxPages: 100,
      pageSize: PAGE_SIZE,
    });
    return [toJobResult("웰니스 관광정보", value)];
  });

  await runStage("관광사진 메타데이터", () =>
    collectPhotoGallery(options.concurrency),
  );

  const monthlyEnd = await findLatestMonthlyPeriod(regions[0]);
  const months = createMonthRange(monthlyEnd, options.months);

  await runStage("기초지자체 중심 관광지", () =>
    collectMunicipalCore(regions, months, options.concurrency),
  );

  await runStage("관광지 집중률", async () => {
    const completed = await loadCompletedRunKeys(
      ["ktoTouristSpotConcentrationRate"],
      (parameters) =>
        joinKey(parameters.areaCode, parameters.sigunguCode),
    );
    const skipped: JobResult[] = [];
    const jobs = regions.flatMap((region) => {
      const key = joinKey(region.areaCode, region.sigunguCode);
      if (completed.has(key)) {
        skipped.push({
          label: `집중률 ${region.areaCode}/${region.sigunguCode}`,
          status: "skipped",
        });
        return [];
      }

      return [{
        label: `${region.areaCode}/${region.sigunguCode}`,
        run: async () => {
          const value = await syncTouristSpotConcentrationRates({
            ...region,
            maxPages: 20,
            pageSize: PAGE_SIZE,
          });
          return toJobResult(
            `집중률 ${region.areaCode}/${region.sigunguCode}`,
            value,
          );
        },
      }];
    });

    return [
      ...skipped,
      ...(await runJobs(jobs, options.concurrency)),
    ];
  });

  let visitorDates: string[] = [];

  await runStage("지역별 방문자 수", async () => {
    const visitorEnd = await findLatestVisitorDate();
    visitorDates = createDateRange(visitorEnd, options.visitorDays);
    return collectVisitorCounts(visitorDates, options.concurrency);
  });

  await runStage("지역 관광 자원 수요 지표", () =>
    collectRegionalMetrics(
      areaCodes,
      months,
      options.concurrency,
      metricDefinitions.slice(0, 2),
    ),
  );

  await runStage("지역 관광 체류·소비 지표", () =>
    collectRegionalMetrics(
      areaCodes,
      months,
      options.concurrency,
      metricDefinitions.slice(2),
    ),
  );

  const failed = results.filter((result) => result.status === "failed");
  console.log(
    JSON.stringify(
      {
        options,
        regions: regions.length,
        areaCodes: areaCodes.length,
        monthlyRange: [months.at(-1), months[0]],
        visitorRange: [visitorDates.at(-1), visitorDates[0]],
        completed: results.filter((result) => result.status === "completed")
          .length,
        skipped: results.filter((result) => result.status === "skipped").length,
        failed: failed.length,
        failures: failed.slice(0, 50),
      },
      null,
      2,
    ),
  );

  if (failed.length > 0) process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

async function runStage(
  label: string,
  collect: () => Promise<JobResult[]>,
) {
  console.log(`\n[${label}] 시작`);
  let stageResults: JobResult[];

  try {
    stageResults = await collect();
  } catch (error) {
    const message = getErrorMessage(error);
    stageResults = [
      {
        label,
        status: "failed",
        error: message,
      },
    ];
    console.error(`[${label}] 단계 오류 · ${message}`);
  }

  results.push(...stageResults);
  const failed = stageResults.filter((result) => result.status === "failed");
  console.log(
    `[${label}] 완료: 성공 ${stageResults.filter((result) => result.status === "completed").length}, 건너뜀 ${stageResults.filter((result) => result.status === "skipped").length}, 실패 ${failed.length}`,
  );
}

async function collectPhotoGallery(concurrency: number) {
  const firstPage = await fetchTourismPhotoGalleryRecords({
    pageNo: 1,
    numOfRows: 1,
  });
  const jobs = [];
  const skipped: JobResult[] = [];
  const completed = await loadCompletedRunKeys(
    ["ktoTourismPhotoGallery"],
    (parameters) => joinKey(parameters.startPage),
  );

  for (
    let startPage = 1;
    startPage <= Math.ceil(firstPage.totalCount / PAGE_SIZE);
    startPage += PAGES_PER_JOB
  ) {
    const page = startPage;
    if (completed.has(String(page))) {
      skipped.push({
        label: `관광사진 ${page}페이지`,
        status: "skipped",
      });
      continue;
    }
    jobs.push({
      label: `관광사진 ${page}페이지`,
      run: async () => {
        const value = await syncTourismPhotoGallery({
          startPage: page,
          maxPages: PAGES_PER_JOB,
          pageSize: PAGE_SIZE,
        });
        return toJobResult(`관광사진 ${page}페이지`, value);
      },
    });
  }

  return [...skipped, ...(await runJobs(jobs, concurrency))];
}

async function collectMunicipalCore(
  regions: Region[],
  months: string[],
  concurrency: number,
) {
  const jobs = [];
  const skipped: JobResult[] = [];
  const completed = await loadCompletedRunKeys(
    ["ktoMunicipalCoreTourism"],
    (parameters) =>
      joinKey(
        parameters.baseYm,
        parameters.areaCode,
        parameters.sigunguCode,
      ),
  );

  for (const baseYm of months) {
    for (const region of regions) {
      const key = joinKey(baseYm, region.areaCode, region.sigunguCode);
      if (completed.has(key)) {
        skipped.push({
          label: `중심 관광지 ${baseYm} ${region.sigunguCode}`,
          status: "skipped",
        });
        continue;
      }

      jobs.push({
        label: `중심 관광지 ${baseYm} ${region.sigunguCode}`,
        run: async () => {
          const value = await syncMunicipalCoreTourism({
            baseYm,
            ...region,
            maxPages: 10,
            pageSize: PAGE_SIZE,
          });
          return toJobResult(
            `중심 관광지 ${baseYm} ${region.sigunguCode}`,
            value,
          );
        },
      });
    }
  }

  return [...skipped, ...(await runJobs(jobs, concurrency))];
}

async function collectVisitorCounts(
  dates: string[],
  concurrency: number,
) {
  const levels: VisitorAggregationLevel[] = ["metropolitan", "municipal"];
  const jobs = [];
  const skipped: JobResult[] = [];
  const completed = await loadCompletedRunKeys(
    ["ktoRegionalVisitorCount"],
    (parameters) =>
      joinKey(parameters.aggregationLevel, parameters.baseYmd),
  );

  for (const baseYmd of dates) {
    for (const aggregationLevel of levels) {
      const key = joinKey(aggregationLevel, baseYmd);
      if (completed.has(key)) {
        skipped.push({
          label: `방문자 ${aggregationLevel} ${baseYmd}`,
          status: "skipped",
        });
        continue;
      }

      jobs.push({
        label: `방문자 ${aggregationLevel} ${baseYmd}`,
        run: async () => {
          const value = await syncRegionalVisitorCounts({
            aggregationLevel,
            baseYmd,
            maxPages: 20,
            pageSize: PAGE_SIZE,
          });
          return toJobResult(
            `방문자 ${aggregationLevel} ${baseYmd}`,
            value,
          );
        },
      });
    }
  }

  return [...skipped, ...(await runJobs(jobs, concurrency))];
}

async function collectRegionalMetrics(
  areaCodes: string[],
  months: string[],
  concurrency: number,
  definitions: typeof metricDefinitions,
) {
  const jobs = [];
  const skipped: JobResult[] = [];
  const completed = await loadCompletedRunKeys(
    ["ktoRegionalResourceDemand", "ktoRegionalDemandIntensity"],
    (parameters) =>
      joinKey(
        parameters.metricType,
        parameters.metricCode,
        parameters.baseYm,
        parameters.areaCode,
      ),
  );

  for (const baseYm of months) {
    for (const areaCode of areaCodes) {
      for (const definition of definitions) {
        for (const metricCode of definition.codes) {
          const key = joinKey(
            definition.type,
            metricCode,
            baseYm,
            areaCode,
          );
          if (completed.has(key)) {
            skipped.push({
              label: `지역 지표 ${definition.type}/${metricCode} ${baseYm}/${areaCode}`,
              status: "skipped",
            });
            continue;
          }

          jobs.push({
            label: `지역 지표 ${definition.type}/${metricCode} ${baseYm}/${areaCode}`,
            run: async () => {
              const value = await syncRegionalTourismMetrics({
                metricType: definition.type,
                metricCode,
                baseYm,
                areaCode,
                maxPages: 20,
                pageSize: PAGE_SIZE,
              });
              return toJobResult(
                `지역 지표 ${definition.type}/${metricCode} ${baseYm}/${areaCode}`,
                value,
              );
            },
          });
        }
      }
    }
  }

  return [...skipped, ...(await runJobs(jobs, concurrency))];
}

async function runJobs(
  jobs: Array<{ label: string; run: () => Promise<JobResult> }>,
  concurrency: number,
) {
  const jobResults: JobResult[] = [];
  let cursor = 0;
  let completed = 0;
  let quotaExceeded = false;

  const worker = async () => {
    while (true) {
      if (quotaExceeded) return;
      const job = jobs[cursor];
      cursor += 1;
      if (!job) return;

      for (
        let attempt = 1;
        attempt <= MAX_TRANSIENT_ATTEMPTS;
        attempt += 1
      ) {
        try {
          const result = await job.run();
          jobResults.push(result);
          completed += 1;
          if (completed === jobs.length || completed % 25 === 0) {
            console.log(`  진행 ${completed}/${jobs.length}`);
          }
          break;
        } catch (error) {
          const message = getErrorMessage(error);
          if (message.includes("HTTP 429")) {
            quotaExceeded = true;
          }

          if (
            !quotaExceeded &&
            attempt < MAX_TRANSIENT_ATTEMPTS &&
            isTransientError(message)
          ) {
            const delay = attempt * 1_500;
            console.warn(
              `  ↻ ${job.label} · 일시 오류 재시도 ${attempt}/${MAX_TRANSIENT_ATTEMPTS - 1}`,
            );
            await wait(delay);
            continue;
          }

          jobResults.push({
            label: job.label,
            status: "failed",
            error: message,
          });
          console.error(`  ✗ ${job.label} · ${message}`);
          break;
        }
      }
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, Math.max(jobs.length, 1)) },
      () => worker(),
    ),
  );

  if (quotaExceeded && cursor < jobs.length) {
    console.warn(
      `  API 호출 한도에 도달해 ${jobs.length - cursor}개 작업을 다음 실행으로 보류합니다.`,
    );
  }
  return jobResults;
}

async function failStaleSyncRuns() {
  const staleBefore = new Date(
    Date.now() - STALE_RUN_MINUTES * 60 * 1_000,
  );
  const updated = await prisma.externalDataSyncRun.updateMany({
    where: {
      source: { startsWith: "kto" },
      status: "running",
      startedAt: { lt: staleBefore },
    },
    data: {
      status: "failed",
      failedCount: 1,
      errorMessage:
        "이전 수집 프로세스가 종료되어 다음 실행에서 다시 시도합니다.",
      finishedAt: new Date(),
    },
  });
  return updated.count;
}

async function loadCompletedRunKeys(
  sources: string[],
  createKey: (parameters: Record<string, Prisma.JsonValue>) => string | null,
) {
  const runs = await prisma.externalDataSyncRun.findMany({
    where: {
      source: { in: sources },
      status: "succeeded",
    },
    select: { parameters: true },
  });
  const keys = new Set<string>();

  for (const run of runs) {
    const parameters = asObject(run.parameters);
    if (!parameters) continue;
    const key = createKey(parameters);
    if (key) keys.add(key);
  }

  return keys;
}

async function loadRegions(): Promise<Region[]> {
  const records = await prisma.tourismPlaceSourceRecord.findMany({
    select: { rawPayload: true },
  });
  const regionMap = new Map<string, Region>();

  for (const record of records) {
    const payload = asObject(record.rawPayload);
    const areaCode = cleanCode(payload?.lDongRegnCd);
    const rawSigunguCode = cleanCode(payload?.lDongSignguCd);
    if (!areaCode || !rawSigunguCode) continue;

    const sigunguCode =
      rawSigunguCode.length <= 3
        ? `${areaCode}${rawSigunguCode.padStart(3, "0")}`
        : rawSigunguCode;
    regionMap.set(`${areaCode}:${sigunguCode}`, { areaCode, sigunguCode });
  }

  if (regionMap.size === 0) {
    const existing = await prisma.municipalCoreTourismSourceRecord.groupBy({
      by: ["areaCode", "sigunguCode"],
    });
    for (const region of existing) {
      regionMap.set(`${region.areaCode}:${region.sigunguCode}`, region);
    }
  }

  return [...regionMap.values()].sort((left, right) =>
    left.sigunguCode.localeCompare(right.sigunguCode),
  );
}

async function findLatestMonthlyPeriod(region: Region) {
  const [municipal, metric] = await Promise.all([
    prisma.municipalCoreTourismSourceRecord.aggregate({
      _max: { baseYm: true },
    }),
    prisma.tourismRegionMetric.aggregate({ _max: { baseYm: true } }),
  ]);
  const existing = [municipal._max.baseYm, metric._max.baseYm]
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  if (existing) return existing;

  for (const baseYm of createMonthRange(formatMonth(new Date()), 36)) {
    const page = await fetchMunicipalCoreTourism({
      baseYm,
      ...region,
      pageNo: 1,
      numOfRows: 1,
    });
    if (page.totalCount > 0) return baseYm;
  }

  throw new Error("최근 36개월 안에서 월별 관광 데이터의 기준월을 찾지 못했습니다.");
}

async function findLatestVisitorDate() {
  const existing = await prisma.regionalVisitorCountRecord.aggregate({
    _max: { baseYmd: true },
  });
  if (existing._max.baseYmd) return existing._max.baseYmd;

  const today = startOfUtcDay(new Date());
  const offsets = [
    ...Array.from({ length: 31 }, (_, index) => index + 1),
    ...Array.from({ length: 53 }, (_, index) => 35 + index * 7),
  ];

  for (const offset of offsets) {
    const date = addUtcDays(today, -offset);
    const baseYmd = formatDate(date);
    const page = await fetchRegionalVisitorCounts({
      aggregationLevel: "metropolitan",
      baseYmd,
      pageNo: 1,
      numOfRows: 1,
    });
    if (page.totalCount > 0) return baseYmd;
  }

  throw new Error("최근 1년 안에서 지역별 방문자 수의 최신 기준일을 찾지 못했습니다.");
}

function createMonthRange(endYm: string, count: number) {
  const year = Number(endYm.slice(0, 4));
  const month = Number(endYm.slice(4, 6)) - 1;
  return Array.from({ length: count }, (_, index) =>
    formatMonth(new Date(Date.UTC(year, month - index, 1))),
  );
}

function createDateRange(endYmd: string, count: number) {
  const date = new Date(
    Date.UTC(
      Number(endYmd.slice(0, 4)),
      Number(endYmd.slice(4, 6)) - 1,
      Number(endYmd.slice(6, 8)),
    ),
  );
  return Array.from({ length: count }, (_, index) =>
    formatDate(addUtcDays(date, -index)),
  );
}

function formatMonth(date: Date) {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatDate(date: Date) {
  return `${formatMonth(date)}${String(date.getUTCDate()).padStart(2, "0")}`;
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function toJobResult(
  label: string,
  value: { received: number; failed: number },
): JobResult {
  return {
    label,
    status: value.failed > 0 ? "failed" : "completed",
    received: value.received,
    failed: value.failed,
  };
}

function parseOptions(args: string[]): CollectionOptions {
  const values = new Map<string, string>();
  const normalizedArgs = args.filter((argument) => argument !== "--");

  for (let index = 0; index < normalizedArgs.length; index += 1) {
    const key = normalizedArgs[index];
    const value = normalizedArgs[index + 1];
    if (!key?.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error(`지원하지 않는 인자입니다: ${key ?? ""}`);
    }
    values.set(key, value);
    index += 1;
  }

  return {
    months: readPositiveInteger(values.get("--months"), DEFAULT_MONTHS, 60),
    visitorDays: readPositiveInteger(
      values.get("--visitor-days"),
      DEFAULT_VISITOR_DAYS,
      365,
    ),
    concurrency: readPositiveInteger(
      values.get("--concurrency"),
      DEFAULT_CONCURRENCY,
      4,
    ),
  };
}

function readPositiveInteger(
  value: string | undefined,
  fallback: number,
  maximum: number,
) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error(`1~${maximum} 범위의 정수가 필요합니다: ${value}`);
  }
  return parsed;
}

function asObject(value: Prisma.JsonValue) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

function cleanCode(value: Prisma.JsonValue | undefined) {
  return typeof value === "string" && /^\d+$/.test(value.trim())
    ? value.trim()
    : null;
}

function joinKey(...values: Prisma.JsonValue[]) {
  const normalized = values.map((value) => {
    if (typeof value === "string" && value.length > 0) return value;
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
    return null;
  });

  return normalized.some((value) => value === null)
    ? null
    : normalized.join(":");
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isTransientError(message: string) {
  return (
    message.includes("시간이 초과") ||
    message.includes("연결하지 못") ||
    /HTTP 50[234]/.test(message)
  );
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
