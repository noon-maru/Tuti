import { prisma } from "../src/server/db/prisma";
import { fetchMunicipalCoreTourism } from "../src/server/tourism/municipalCoreTourismApiClient";
import { fetchRegionalVisitorCounts } from "../src/server/tourism/regionalVisitorCountApiClient";
import type { RegionalMetricType } from "../src/server/tourism/regionalTourismApiClient";
import { syncMunicipalCoreTourism } from "../src/server/tourism/syncMunicipalCoreTourism";
import { syncRegionalTourismMetrics } from "../src/server/tourism/syncRegionalTourismMetrics";
import { syncRegionalVisitorCounts } from "../src/server/tourism/syncRegionalVisitorCounts";

const DEFAULT_VISITOR_DAYS = 14;
const DEFAULT_CONCURRENCY = 2;
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

const options = parseOptions(process.argv.slice(2));

try {
  const regions = await prisma.municipalCoreTourismSourceRecord.groupBy({
    by: ["areaCode", "sigunguCode"],
    orderBy: [{ areaCode: "asc" }, { sigunguCode: "asc" }],
  });
  if (regions.length === 0) {
    throw new Error("중심 관광지 지역 기준이 없습니다. 초기 전수수집 상태를 확인해주세요.");
  }

  const [visitorResult, monthlyResult] = await Promise.all([
    refreshVisitorCounts(),
    options.monthly
      ? refreshMonthlySeries(regions)
      : Promise.resolve({
          latestAvailable: null,
          months: [],
          completed: 0,
          failed: 0,
          message: "월별 갱신 옵션이 없어 월별 지표를 건너뜁니다.",
        }),
  ]);

  console.log(JSON.stringify({ visitorResult, monthlyResult }, null, 2));
  if (visitorResult.failed + monthlyResult.failed > 0) process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

async function refreshVisitorCounts() {
  const latestAvailable = await findLatestVisitorDate();
  const dates = Array.from({ length: options.visitorDays }, (_, index) =>
    formatDate(addDays(parseDate(latestAvailable), -index)),
  );
  const jobs = dates.flatMap((baseYmd) =>
    (["metropolitan", "municipal"] as const).map((aggregationLevel) => ({
      label: `${aggregationLevel}/${baseYmd}`,
      run: () =>
        syncRegionalVisitorCounts({
          aggregationLevel,
          baseYmd,
          maxPages: 20,
          pageSize: 100,
        }),
    })),
  );
  const result = await runJobs(jobs, options.concurrency);
  return { latestAvailable, days: dates.length, ...result };
}

async function refreshMonthlySeries(
  regions: Array<{ areaCode: string; sigunguCode: string }>,
) {
  const [storedCore, storedMetric] = await Promise.all([
    prisma.municipalCoreTourismSourceRecord.aggregate({ _max: { baseYm: true } }),
    prisma.tourismRegionMetric.aggregate({ _max: { baseYm: true } }),
  ]);
  const latestAvailable = await findLatestCoreMonth(regions[0]);
  const oldestStored = [storedCore._max.baseYm, storedMetric._max.baseYm]
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(0);
  const missingMonths = oldestStored && oldestStored < latestAvailable
    ? createMonthRange(nextMonth(oldestStored), latestAvailable)
    : [];
  const months = [...new Set([...missingMonths, latestAvailable])].sort();

  let completed = 0;
  let failed = 0;
  for (const baseYm of months) {
    const core = await runJobs(
      regions.map((region) => ({
        label: `core/${baseYm}/${region.areaCode}/${region.sigunguCode}`,
        run: () =>
          syncMunicipalCoreTourism({
            baseYm,
            ...region,
            maxPages: 10,
            pageSize: 100,
          }),
      })),
      options.concurrency,
    );
    completed += core.completed;
    failed += core.failed;

    const areaCodes = [...new Set(regions.map((region) => region.areaCode))];
    const metric = await runJobs(
      areaCodes.flatMap((areaCode) =>
        metricDefinitions.flatMap((definition) =>
          definition.codes.map((metricCode) => ({
            label: `${definition.type}/${metricCode}/${baseYm}/${areaCode}`,
            run: () =>
              syncRegionalTourismMetrics({
                metricType: definition.type,
                metricCode,
                baseYm,
                areaCode,
                maxPages: 20,
                pageSize: 100,
              }),
          })),
        ),
      ),
      options.concurrency,
    );
    completed += metric.completed;
    failed += metric.failed;
  }
  return { latestAvailable, months, completed, failed };
}

async function findLatestVisitorDate() {
  const today = startOfUtcDay(new Date());
  for (let offset = 1; offset <= 45; offset += 1) {
    const baseYmd = formatDate(addDays(today, -offset));
    const page = await fetchRegionalVisitorCounts({
      aggregationLevel: "metropolitan",
      baseYmd,
      pageNo: 1,
      numOfRows: 1,
    });
    if (page.totalCount > 0) return baseYmd;
  }
  throw new Error("최근 45일 안에서 지역 방문자 데이터의 최신 일자를 찾지 못했습니다.");
}

async function findLatestCoreMonth(region: {
  areaCode: string;
  sigunguCode: string;
}) {
  const current = new Date();
  for (let offset = 0; offset < 18; offset += 1) {
    const baseYm = formatMonth(
      new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - offset, 1)),
    );
    const page = await fetchMunicipalCoreTourism({
      baseYm,
      ...region,
      pageNo: 1,
      numOfRows: 1,
    });
    if (page.totalCount > 0) return baseYm;
  }
  throw new Error("최근 18개월 안에서 중심 관광지 데이터의 최신 월을 찾지 못했습니다.");
}

async function runJobs<T>(
  jobs: Array<{ label: string; run: () => Promise<T> }>,
  concurrency: number,
) {
  const result = { scheduled: jobs.length, completed: 0, failed: 0 };
  let cursor = 0;
  const worker = async () => {
    while (true) {
      const job = jobs[cursor];
      cursor += 1;
      if (!job) return;
      try {
        await job.run();
        result.completed += 1;
      } catch (error) {
        result.failed += 1;
        console.error(`${job.label} 갱신 실패 · ${getErrorMessage(error)}`);
      }
      const processed = result.completed + result.failed;
      if (processed % 25 === 0 || processed === jobs.length) {
        console.log(`시계열 갱신 ${processed}/${jobs.length}`);
      }
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, Math.max(jobs.length, 1)) },
      () => worker(),
    ),
  );
  return result;
}

function parseOptions(args: string[]) {
  const normalized = args.filter((argument) => argument !== "--");
  const values = new Map<string, string>();
  let monthly = false;
  for (let index = 0; index < normalized.length; index += 1) {
    const key = normalized[index];
    if (key === "--monthly") {
      monthly = true;
      continue;
    }
    const value = normalized[index + 1];
    if (!key?.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error(`지원하지 않는 인자입니다: ${key ?? ""}`);
    }
    values.set(key, value);
    index += 1;
  }
  return {
    visitorDays: readInteger(
      values.get("--visitor-days"),
      DEFAULT_VISITOR_DAYS,
      31,
    ),
    concurrency: readInteger(
      values.get("--concurrency"),
      DEFAULT_CONCURRENCY,
      4,
    ),
    monthly,
  };
}

function readInteger(value: string | undefined, fallback: number, maximum: number) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error(`1~${maximum} 범위의 정수가 필요합니다: ${value}`);
  }
  return parsed;
}

function createMonthRange(start: string, end: string) {
  const months = [];
  let cursor = start;
  while (cursor <= end) {
    months.push(cursor);
    cursor = nextMonth(cursor);
  }
  return months;
}

function nextMonth(value: string) {
  const date = new Date(
    Date.UTC(Number(value.slice(0, 4)), Number(value.slice(4, 6)), 1),
  );
  return formatMonth(date);
}

function parseDate(value: string) {
  return new Date(
    Date.UTC(
      Number(value.slice(0, 4)),
      Number(value.slice(4, 6)) - 1,
      Number(value.slice(6, 8)),
    ),
  );
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatDate(date: Date) {
  return `${formatMonth(date)}${String(date.getUTCDate()).padStart(2, "0")}`;
}

function formatMonth(date: Date) {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
