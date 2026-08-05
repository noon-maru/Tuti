import { prisma } from "../src/server/db/prisma";
import {
  loadPlaceCandidateAssessments,
  type AssessedPlace,
} from "../src/server/recommendations/loadPlaceCandidateAssessments";
import { persistPlaceCandidateAssessments } from "../src/server/recommendations/persistPlaceCandidateAssessments";
import { syncTourismPlaceEditorial } from "../src/server/tourism/syncTourismPlaceEditorial";

const DEFAULT_LIMIT = 950;
const DEFAULT_CONCURRENCY = 2;
const ADVISORY_LOCK_ID = 1_418_031_901;

const options = parseOptions(process.argv.slice(2));
let locked = false;

try {
  locked = await acquireLock();
  if (!locked) {
    throw new Error("장소 후보 갱신 작업이 이미 실행 중입니다.");
  }

  let assessed = await loadPlaceCandidateAssessments();
  const collection = options.skipEnrichment
    ? emptyCollectionResult()
    : await enrichEditorials(assessed);

  if (collection.synced > 0) {
    assessed = await loadPlaceCandidateAssessments();
  }

  const persisted = await persistPlaceCandidateAssessments(assessed);
  const statusCounts = countStatuses(assessed);

  console.log(
    JSON.stringify(
      {
        collection,
        assessment: {
          total: assessed.length,
          persisted: persisted.updated,
          evaluatedAt: persisted.evaluatedAt,
          statuses: statusCounts,
        },
      },
      null,
      2,
    ),
  );

  if (collection.failed > 0 && !collection.quotaStopped) process.exitCode = 1;
} finally {
  if (locked) await releaseLock();
  await prisma.$disconnect();
}

async function enrichEditorials(assessed: AssessedPlace[]) {
  const targets = assessed
    .filter(({ sourceId }) => Boolean(sourceId))
    .filter(({ editorialNeedsSync }) => options.force || editorialNeedsSync)
    .sort(compareCollectionPriority)
    .slice(0, options.limit);
  const result = {
    eligible: assessed.filter(
      ({ sourceId, editorialNeedsSync }) =>
        Boolean(sourceId) && (options.force || editorialNeedsSync),
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
    `장소 후보 우선 보강 시작: 최대 ${targets.length}곳, 동시 작업 ${options.concurrency}개`,
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
  return result;
}

function compareCollectionPriority(left: AssessedPlace, right: AssessedPlace) {
  const statusPriority = {
    selected: 0,
    enrich: 1,
    pending: 2,
    low_burden_mismatch: 3,
    invalid: 4,
  } as const;
  return (
    statusPriority[left.assessment.status] -
      statusPriority[right.assessment.status] ||
    right.assessment.score - left.assessment.score ||
    left.place.id.localeCompare(right.place.id)
  );
}

function countStatuses(assessed: AssessedPlace[]) {
  return assessed.reduce<Record<string, number>>((counts, row) => {
    counts[row.assessment.status] = (counts[row.assessment.status] ?? 0) + 1;
    return counts;
  }, {});
}

function emptyCollectionResult() {
  return {
    eligible: 0,
    scheduled: 0,
    synced: 0,
    fresh: 0,
    retryWait: 0,
    failed: 0,
    quotaStopped: false,
  };
}

async function acquireLock() {
  const rows = await prisma.$queryRaw<Array<{ locked: boolean }>>`
    SELECT pg_try_advisory_lock(${ADVISORY_LOCK_ID}) AS locked
  `;
  return rows[0]?.locked === true;
}

async function releaseLock() {
  await prisma.$queryRaw`
    SELECT pg_advisory_unlock(${ADVISORY_LOCK_ID})
  `;
}

function parseOptions(args: string[]) {
  const normalized = args.filter((argument) => argument !== "--");
  const values = new Map<string, string>();
  let force = false;
  let skipEnrichment = false;

  for (let index = 0; index < normalized.length; index += 1) {
    const key = normalized[index];
    if (key === "--force") {
      force = true;
      continue;
    }
    if (key === "--skip-enrichment") {
      skipEnrichment = true;
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
    limit: readInteger(values.get("--limit"), DEFAULT_LIMIT, 20_000),
    concurrency: readInteger(
      values.get("--concurrency"),
      DEFAULT_CONCURRENCY,
      4,
    ),
    force,
    skipEnrichment,
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
