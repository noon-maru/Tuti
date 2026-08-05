import { prisma } from "../src/server/db/prisma";
import { loadPlaceCandidateAssessments } from "../src/server/recommendations/loadPlaceCandidateAssessments";
import { syncTourismPlaceEditorial } from "../src/server/tourism/syncTourismPlaceEditorial";

const DEFAULT_LIMIT = 450;
const DEFAULT_CONCURRENCY = 2;

const options = parseOptions(process.argv.slice(2));

try {
  const assessed = await loadPlaceCandidateAssessments();
  const targets = assessed
    .filter(({ assessment }) => assessment.status === "enrich")
    .filter(({ sourceId }) => Boolean(sourceId))
    .filter(({ editorialSyncedAt }) => options.force || !editorialSyncedAt)
    .slice(0, options.limit);
  const result = {
    candidates: assessed.filter(
      ({ assessment }) => assessment.status === "enrich",
    ).length,
    scheduled: targets.length,
    synced: 0,
    fresh: 0,
    retryWait: 0,
    failed: 0,
    quotaStopped: false,
  };
  let cursor = 0;

  console.log(
    `관광지 소개정보 1차 보강 시작: 최대 ${targets.length}곳, 동시 작업 ${options.concurrency}개`,
  );
  console.log(
    `예상 최대 API 호출: ${targets.length * 2}회(detailCommon2 + detailIntro2)`,
  );

  const worker = async () => {
    while (!result.quotaStopped) {
      const target = targets[cursor];
      cursor += 1;
      if (!target?.sourceId) return;

      try {
        const status = await syncTourismPlaceEditorial(target.sourceId, {
          force: options.force,
        });
        if (status === "synced") result.synced += 1;
        if (status === "fresh") result.fresh += 1;
        if (status === "retry_wait") result.retryWait += 1;
      } catch (error) {
        result.failed += 1;
        const message = getErrorMessage(error);
        console.error(`수집 실패: ${target.place.name} · ${message}`);
        if (isQuotaError(message)) result.quotaStopped = true;
      }

      const processed =
        result.synced + result.fresh + result.retryWait + result.failed;
      if (processed % 25 === 0 || processed === targets.length) {
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
  let force = false;

  for (let index = 0; index < normalized.length; index += 1) {
    const key = normalized[index];
    if (key === "--force") {
      force = true;
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
    limit: readInteger(values.get("--limit"), DEFAULT_LIMIT, 5_000),
    concurrency: readInteger(
      values.get("--concurrency"),
      DEFAULT_CONCURRENCY,
      4,
    ),
    force,
  };
}

function readInteger(
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

function isQuotaError(message: string) {
  return (
    message.includes("HTTP 429") ||
    message.includes("LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR") ||
    message.includes("일일 트래픽")
  );
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "알 수 없는 수집 오류";
}
