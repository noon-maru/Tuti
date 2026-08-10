import { prisma } from "../src/server/db/prisma";
import { syncTouristSpotConcentrationRates } from "../src/server/tourism/syncTouristSpotConcentrationRates";

const DEFAULT_SHARDS = 7;
const DEFAULT_CONCURRENCY = 2;
const options = parseOptions(process.argv.slice(2));

try {
  const regions = await prisma.municipalCoreTourismSourceRecord.groupBy({
    by: ["areaCode", "sigunguCode"],
    orderBy: [{ areaCode: "asc" }, { sigunguCode: "asc" }],
  });
  const targets = regions.filter(
    (region) => regionShard(region.areaCode, region.sigunguCode, options.shards) === options.shard,
  );
  const result = {
    shard: options.shard,
    shards: options.shards,
    regions: regions.length,
    scheduled: targets.length,
    completed: 0,
    received: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    quotaStopped: false,
  };
  let cursor = 0;

  console.log(
    `관광지 집중률 순환 갱신 시작: ${options.shard + 1}/${options.shards} 묶음, ${targets.length}개 시군구`,
  );

  const worker = async () => {
    while (!result.quotaStopped) {
      const region = targets[cursor];
      cursor += 1;
      if (!region) return;

      try {
        const synced = await syncTouristSpotConcentrationRates({
          areaCode: region.areaCode,
          sigunguCode: region.sigunguCode,
          maxPages: 20,
          pageSize: 100,
        });
        result.completed += 1;
        result.received += synced.received;
        result.created += synced.created;
        result.updated += synced.updated;
        result.skipped += synced.skipped;
        result.failed += synced.failed;
      } catch (error) {
        result.failed += 1;
        const message = getErrorMessage(error);
        console.error(
          `집중률 갱신 실패: ${region.areaCode}/${region.sigunguCode} · ${message}`,
        );
        if (isQuotaError(message)) result.quotaStopped = true;
      }

      const processed = result.completed + result.failed;
      if (processed % 10 === 0 || processed === targets.length) {
        console.log(`진행 ${processed}/${targets.length}`);
      }
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(options.concurrency, Math.max(targets.length, 1)) },
      () => worker(),
    ),
  );

  console.log(JSON.stringify(result, null, 2));
  if (result.failed > 0 && !result.quotaStopped) process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

function parseOptions(args: string[]) {
  const normalized = args.filter((argument) => argument !== "--");
  const values = new Map<string, string>();
  for (let index = 0; index < normalized.length; index += 2) {
    const key = normalized[index];
    const value = normalized[index + 1];
    if (!key?.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error(`지원하지 않는 인자입니다: ${key ?? ""}`);
    }
    values.set(key, value);
  }

  const shards = readInteger(values.get("--shards"), DEFAULT_SHARDS, 31);
  const defaultShard = koreanEpochDay() % shards;
  const shard = readInteger(values.get("--shard"), defaultShard, shards - 1, 0);
  const concurrency = readInteger(
    values.get("--concurrency"),
    DEFAULT_CONCURRENCY,
    4,
  );
  return { shards, shard, concurrency };
}

function readInteger(
  value: string | undefined,
  fallback: number,
  maximum: number,
  minimum = 1,
) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${minimum}~${maximum} 범위의 정수가 필요합니다: ${value}`);
  }
  return parsed;
}

function regionShard(areaCode: string, sigunguCode: string, shards: number) {
  const value = `${areaCode}:${sigunguCode}`;
  let hash = 0;
  for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash % shards;
}

function koreanEpochDay() {
  const dateKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return Math.floor(Date.parse(`${dateKey}T00:00:00Z`) / 86_400_000);
}

function isQuotaError(message: string) {
  return (
    message.includes("HTTP 429") ||
    message.includes("LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR") ||
    message.includes("일일 트래픽")
  );
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
