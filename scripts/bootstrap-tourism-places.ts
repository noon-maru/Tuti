import { prisma } from "../src/server/db/prisma";
import { fetchAreaBasedTourismPlaces } from "../src/server/tourism/tourApiClient";
import {
  syncTourismPlaces,
  type SyncTourismPlacesResult,
} from "../src/server/tourism/syncTourismPlaces";

const PAGE_SIZE = 100;
const PAGES_PER_JOB = 10;
const CONCURRENCY = 4;
const contentTypes = [
  { id: "12", label: "관광지" },
  { id: "14", label: "문화시설" },
  { id: "25", label: "여행코스" },
  { id: "28", label: "레포츠" },
] as const;

type SyncJob = {
  contentTypeId: string;
  label: string;
  startPage: number;
  maxPages: number;
};

type TypeSummary = {
  contentTypeId: string;
  label: string;
  totalAvailable: number;
  pages: number;
  received: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
};

try {
  const before = await readCounts();
  const totals = await Promise.all(
    contentTypes.map(async (type) => {
      const page = await fetchAreaBasedTourismPlaces({
        pageNo: 1,
        numOfRows: 1,
        contentTypeId: type.id,
      });

      return {
        ...type,
        totalAvailable: page.totalCount,
      };
    }),
  );
  const jobs = totals.flatMap(createJobs);
  const summaries = new Map<string, TypeSummary>(
    totals.map((type) => [
      type.id,
      {
        contentTypeId: type.id,
        label: type.label,
        totalAvailable: type.totalAvailable,
        pages: 0,
        received: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        failed: 0,
      },
    ]),
  );
  const jobErrors: Array<{ job: SyncJob; error: unknown }> = [];
  let cursor = 0;

  console.log(
    `TourAPI 전수 동기화를 시작합니다: ${jobs.length}개 구간, 동시 작업 ${CONCURRENCY}개`,
  );
  console.log(
    `동기화 전 원천 ${before.raw.toLocaleString("ko-KR")}개, 장소 후보 ${before.places.toLocaleString("ko-KR")}개`,
  );

  const worker = async (workerId: number) => {
    while (true) {
      const jobIndex = cursor;
      cursor += 1;
      const job = jobs[jobIndex];

      if (!job) return;

      const endPage = job.startPage + job.maxPages - 1;
      console.log(
        `[${workerId}] ${job.label} ${job.startPage}~${endPage}페이지 시작`,
      );

      try {
        const result = await syncTourismPlaces({
          contentTypeId: job.contentTypeId,
          startPage: job.startPage,
          maxPages: job.maxPages,
          pageSize: PAGE_SIZE,
        });

        mergeResult(summaries.get(job.contentTypeId), result);
        console.log(
          `[${workerId}] ${job.label} ${job.startPage}페이지 구간 완료: 수신 ${result.received}, 실패 ${result.failed}`,
        );
      } catch (error) {
        jobErrors.push({ job, error });
        console.error(
          `[${workerId}] ${job.label} ${job.startPage}페이지 구간 실패`,
          error,
        );
      }
    }
  };

  await Promise.all(
    Array.from({ length: CONCURRENCY }, (_, index) => worker(index + 1)),
  );

  const after = await readCounts();
  const summary = [...summaries.values()];

  console.log(
    JSON.stringify(
      {
        before,
        after,
        summary,
        failedJobs: jobErrors.length,
      },
      null,
      2,
    ),
  );

  if (
    jobErrors.length > 0 ||
    summary.some((item) => item.failed > 0)
  ) {
    process.exitCode = 1;
  }
} finally {
  await prisma.$disconnect();
}

function createJobs(type: {
  id: string;
  label: string;
  totalAvailable: number;
}) {
  const totalPages = Math.ceil(type.totalAvailable / PAGE_SIZE);
  const jobs: SyncJob[] = [];

  for (
    let startPage = 1;
    startPage <= totalPages;
    startPage += PAGES_PER_JOB
  ) {
    jobs.push({
      contentTypeId: type.id,
      label: type.label,
      startPage,
      maxPages: Math.min(
        PAGES_PER_JOB,
        totalPages - startPage + 1,
      ),
    });
  }

  return jobs;
}

function mergeResult(
  summary: TypeSummary | undefined,
  result: SyncTourismPlacesResult,
) {
  if (!summary) return;

  summary.pages += result.pages;
  summary.received += result.received;
  summary.created += result.created;
  summary.updated += result.updated;
  summary.skipped += result.skipped;
  summary.failed += result.failed;
}

async function readCounts() {
  const [raw, places] = await Promise.all([
    prisma.tourismPlaceSourceRecord.count({
      where: {
        contentTypeId: {
          in: contentTypes.map((type) => type.id),
        },
      },
    }),
    prisma.place.count({
      where: {
        source: "tourapi",
        sourceContentType: {
          in: contentTypes.map((type) => type.id),
        },
      },
    }),
  ]);

  return { raw, places };
}
