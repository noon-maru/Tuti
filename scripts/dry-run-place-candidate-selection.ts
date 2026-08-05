import { prisma } from "../src/server/db/prisma";
import {
  type PlaceCandidateStatus,
} from "../src/server/recommendations/placeCandidateSelection";
import {
  loadPlaceCandidateAssessments,
  type AssessedPlace,
} from "../src/server/recommendations/loadPlaceCandidateAssessments";

const contentTypeLabels: Record<string, string> = {
  "12": "관광지",
  "14": "문화시설",
  "25": "여행코스",
  "28": "레포츠",
};

const statusLabels: Record<PlaceCandidateStatus, string> = {
  selected: "추천 후보",
  enrich: "상세 보강",
  pending: "판단 보류",
  low_burden_mismatch: "저부담 기준 불일치",
  invalid: "데이터 결손",
};

try {
  const assessed = await loadPlaceCandidateAssessments();
  printReport(assessed);
} finally {
  await prisma.$disconnect();
}

function printReport(rows: AssessedPlace[]) {
  const statusCounts = countBy(rows, ({ assessment }) => assessment.status);
  console.log("\nTuti 장소 추천 후보 선정 드라이런");
  console.log("================================");
  console.log("읽기 전용 실행: DB 변경 0건, 삭제 0건");
  console.log(`평가 장소: ${format(rows.length)}개`);
  console.log(`추천풀 후보: ${format(statusCounts.get("selected") ?? 0)}개`);
  console.log(`상세 보강 후 재평가: ${format(statusCounts.get("enrich") ?? 0)}개`);
  console.log(`판단 보류: ${format(statusCounts.get("pending") ?? 0)}개`);
  console.log(
    `저부담 추천풀 불일치: ${format(statusCounts.get("low_burden_mismatch") ?? 0)}개`,
  );
  console.log(`데이터 결손: ${format(statusCounts.get("invalid") ?? 0)}개`);

  const enrichmentTargets = rows.filter(
    ({ assessment }) => assessment.status === "enrich",
  );
  const enrichmentMissingDetails = enrichmentTargets.filter(
    ({ editorialSyncedAt }) => !editorialSyncedAt,
  ).length;
  console.log(
    `└ 상세 API 신규 호출 필요: ${format(enrichmentMissingDetails)}개 장소`,
  );

  printTable("\n점수 분포", [
    ["85~100", countScore(rows, 85, 100)],
    ["70~84", countScore(rows, 70, 84)],
    ["55~69", countScore(rows, 55, 69)],
    ["40~54", countScore(rows, 40, 54)],
    ["0~39", countScore(rows, 0, 39)],
  ]);

  const typeRows = Object.entries(
    groupStatuses(rows, ({ place }) => place.contentTypeId ?? "unknown"),
  )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, counts]) => [
      `${contentTypeLabels[key] ?? "기타"}(${key})`,
      counts.selected ?? 0,
      counts.enrich ?? 0,
      counts.pending ?? 0,
      counts.low_burden_mismatch ?? 0,
      counts.invalid ?? 0,
    ]);
  printTable(
    "\n콘텐츠 유형별 결과 (후보 / 보강 / 보류 / 저부담 불일치 / 결손)",
    typeRows,
  );

  const selectedByRegion = [...countBy(
    rows.filter(({ assessment }) => assessment.status === "selected"),
    ({ place }) => place.sidoName ?? "지역 미상",
  ).entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([region, count]) => [region, count]);
  printTable("\n추천풀 후보 지역 분포", selectedByRegion);

  const reasonCounts = new Map<string, number>();
  for (const { assessment } of rows) {
    for (const reason of [...assessment.reasons, ...assessment.hardExclusions]) {
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
    }
  }
  printTable(
    "\n주요 판정 근거",
    [...reasonCounts.entries()].sort(([, a], [, b]) => b - a).slice(0, 12),
  );

  printPendingAnalysis(rows);

  printSamples("\n추천풀 상위 샘플", rows, "selected", "desc");
  printSamples("\n정보 보강 경계 샘플", rows, "enrich", "desc");
  printSamples("\n판단 보류 상위 샘플", rows, "pending", "desc");
  printSamples(
    "\n저부담 기준 불일치 샘플",
    rows,
    "low_burden_mismatch",
    "desc",
  );
  printSamples("\n데이터 결손 샘플", rows, "invalid", "desc");
}

function printPendingAnalysis(rows: AssessedPlace[]) {
  const pending = rows.filter(
    ({ assessment }) => assessment.status === "pending",
  );
  const overlappingReasons = [
    [
      "Tuti 적합성 근거 부족(적합성 20점 미만)",
      pending.filter(({ assessment }) => assessment.sections.tutiFit < 20).length,
    ],
    [
      "상세·교차 데이터 부족(신뢰도 10점 미만)",
      pending.filter(({ assessment }) => assessment.sections.dataConfidence < 10).length,
    ],
    [
      "혼잡도·수요 등 활용 데이터 부족(활용성 6점 미만)",
      pending.filter(
        ({ assessment }) => assessment.sections.recommendationUtility < 6,
      ).length,
    ],
  ] satisfies Array<[string, number]>;
  const averages = pending.reduce(
    (sum, { assessment }) => ({
      tutiFit: sum.tutiFit + assessment.sections.tutiFit,
      executionEase: sum.executionEase + assessment.sections.executionEase,
      dataConfidence: sum.dataConfidence + assessment.sections.dataConfidence,
      recommendationUtility:
        sum.recommendationUtility + assessment.sections.recommendationUtility,
    }),
    { tutiFit: 0, executionEase: 0, dataConfidence: 0, recommendationUtility: 0 },
  );
  printTable("\n판단 보류 사유 (중복 집계)", overlappingReasons);
  printTable("\n판단 보류 장소 평균 영역 점수", [
    ["Tuti 적합성 / 40", average(averages.tutiFit, pending.length)],
    ["실행 용이성 / 25", average(averages.executionEase, pending.length)],
    ["데이터 신뢰도 / 20", average(averages.dataConfidence, pending.length)],
    [
      "추천 활용성 / 15",
      average(averages.recommendationUtility, pending.length),
    ],
  ]);
}

function printSamples(
  title: string,
  rows: AssessedPlace[],
  status: PlaceCandidateStatus,
  direction: "asc" | "desc",
) {
  console.log(title);
  console.log("-".repeat(title.trim().length));
  rows
    .filter(({ assessment }) => assessment.status === status)
    .sort((a, b) => direction === "desc"
      ? b.assessment.score - a.assessment.score
      : a.assessment.score - b.assessment.score)
    .slice(0, 12)
    .forEach(({ place, assessment }) => {
      const region = [place.sidoName, place.sigunguName].filter(Boolean).join(" ");
      const reasons = assessment.hardExclusions.length > 0
        ? assessment.hardExclusions
        : assessment.reasons.slice(0, 3);
      console.log(
        `- ${place.name} | ${assessment.score}점 | ${statusLabels[assessment.status]} | ${region || "지역 미상"} | ${reasons.join(", ")}`,
      );
    });
}

function groupStatuses(
  rows: AssessedPlace[],
  keyOf: (row: AssessedPlace) => string,
) {
  const groups: Record<string, Partial<Record<PlaceCandidateStatus, number>>> = {};
  for (const row of rows) {
    const key = keyOf(row);
    groups[key] ??= {};
    const status = row.assessment.status;
    groups[key][status] = (groups[key][status] ?? 0) + 1;
  }
  return groups;
}

function countBy<T>(rows: T[], keyOf: (row: T) => string) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = keyOf(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function countScore(rows: AssessedPlace[], min: number, max: number) {
  return rows.filter(({ assessment }) =>
    assessment.score >= min && assessment.score <= max).length;
}

function printTable(title: string, rows: Array<Array<string | number>>) {
  console.log(title);
  console.log("-".repeat(title.trim().length));
  for (const row of rows) {
    console.log(row.map((value) => typeof value === "number" ? format(value) : value).join("\t"));
  }
}

function format(value: number) {
  return value.toLocaleString("ko-KR");
}

function average(total: number, count: number) {
  return count === 0 ? "0" : (total / count).toFixed(1);
}
