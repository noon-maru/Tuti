import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "../src/server/db/prisma";
import { loadPlaceCandidateAssessments } from "../src/server/recommendations/loadPlaceCandidateAssessments";
import { checkEditorialCoverage, willBeRecommendable } from "../src/server/tourism/placeEditorialCoverage";
import { normalizeTourApiPlaceDetail } from "../src/server/tourism/enrichTourismPlaceDetail";
import type { TourApiDetailItem } from "../src/server/tourism/tourApiDetailClient";

// 마이그레이션 전 운영 DB를 읽으므로 신규 컬럼을 추가하는 배포는 이 조회도 호환되게 유지한다.
// 외부 API 호출, 후보 갱신, DB 쓰기 없이 현재 집합과 갱신 후 집합을 함께 확인한다.
const errors: string[] = [];
const summaryRows = readRows("data/place-overview-summaries/2026-10-01.jsonl", "summary");
const actionRows = readRows("data/place-suggested-actions/2026-10-01.jsonl", "action");
const directory = "data/place-visit-time-profiles";
const explicitRows = readdirSync(directory)
  .filter((name) => /^2026-10-02-explicit-[a-z]\.jsonl$/u.test(name))
  .sort().flatMap((name) => readRows(`${directory}/${name}`, "explicit"));
const explicitInputRows = readRows(`${directory}/2026-10-02-explicit-input.jsonl`, "input");
if (!explicitRows.length) errors.push("체류시간 구조화 결과가 없습니다.");
const explicitIds = new Set<string>();
for (const row of explicitRows) {
  if (explicitIds.has(row.contentId)) errors.push(`체류시간 구조화 파일 간 contentId 중복: ${row.contentId}`);
  explicitIds.add(row.contentId);
}

try {
  const assessed = await loadPlaceCandidateAssessments();
  const places = await prisma.place.findMany({
    where: { source: "tourapi" },
    select: {
      id: true, name: true, sourceId: true, isActive: true,
      reviewStatus: true, candidateStatus: true, candidateOverride: true,
      tourismSourceRecord: { select: { detailRecord: {
        select: { overview: true, usageDuration: true, commonPayload: true, introPayload: true },
      } } },
    },
  });
  const activeById = new Map(places.map((place) => [place.id, place.isActive]));
  const predicted = new Set(assessed.filter((row) => willBeRecommendable({
    ...row, assessmentStatus: row.assessment.status,
    isActive: activeById.get(row.place.id) ?? false,
  })).map((row) => row.place.id));
  const current = new Set(places.filter((place) => place.isActive &&
    place.reviewStatus === "approved" && (place.candidateOverride === "include" ||
    (place.candidateOverride === "auto" && place.candidateStatus === "selected")))
    .map((place) => place.id));
  const eligible = places.filter((place) => current.has(place.id) || predicted.has(place.id));
  const result = checkEditorialCoverage(eligible.map((place) => ({
    contentId: place.sourceId ?? place.id,
    name: place.name,
    hasDetail: Boolean(place.tourismSourceRecord?.detailRecord),
    overview: place.tourismSourceRecord?.detailRecord?.overview ?? null,
    normalizedRawOverview: normalizeTourApiPlaceDetail({
      common: asRecord(place.tourismSourceRecord?.detailRecord?.commonPayload),
      intro: asRecord(place.tourismSourceRecord?.detailRecord?.introPayload),
      info: [], images: [],
    }).fields.overview,
    usageDuration: place.tourismSourceRecord?.detailRecord?.usageDuration ?? null,
  })), {
    summaries: new Map(summaryRows.map((row) => [row.contentId, row.summary as string | null])),
    actions: new Map(actionRows.map((row) => [row.contentId, row.action as string])),
    explicit: new Set(explicitRows.map((row) => row.contentId)),
    explicitInputs: new Map(explicitInputRows.map((row) => [row.contentId, row.usageDuration as string])),
  });
  errors.push(...result.errors);
  console.log(`읽기 전용 파생 데이터 사전 검사: 현재 ${current.size}곳, 갱신 후 ${predicted.size}곳, 합계 ${eligible.length}곳`);
  for (const warning of result.warnings) console.warn(`주의: ${warning}`);
  for (const error of errors) console.error(`오류: ${error}`);
  console.log(`검사 결과: 오류 ${errors.length}건, 주의 ${result.warnings.length}건 (DB 변경 0건, 외부 API 호출 0건)`);
  if (errors.length) process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

function asRecord(value: unknown): TourApiDetailItem | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as TourApiDetailItem : null;
}

function readRows(path: string, kind: "summary" | "action" | "explicit" | "input") {
  const rows: Array<Record<string, unknown> & { contentId: string }> = [];
  const seen = new Set<string>();
  let contents: string;
  try { contents = readFileSync(resolve(path), "utf8"); }
  catch { errors.push(`${path}: 입력 파일을 읽지 못했습니다.`); return rows; }
  for (const [index, line] of contents.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line) as Record<string, unknown>;
      if (!row || typeof row !== "object" || typeof row.contentId !== "string") throw new Error("contentId 오류");
      if (seen.has(row.contentId)) throw new Error("contentId 중복");
      seen.add(row.contentId);
      const keys = {
        summary: "contentId,summary", action: "action,contentId",
        input: "contentId,contentTypeId,experienceType,name,usageDuration",
        explicit: "confidence,contentId,evidence,maximumMinutes,minimumMinutes,source,typicalMinutes",
      }[kind];
      if (Object.keys(row).sort().join(",") !== keys) throw new Error("허용되지 않은 필드");
      if (kind === "summary" || kind === "action") {
        const field = kind === "summary" ? "summary" : "action";
        const value = row[field];
        if (!(kind === "summary" && value === null)) {
          if (typeof value !== "string") throw new Error(`${field} 형식 오류`);
          row[field] = value.replace(/\s+/g, " ").trim();
          if (!(row[field] as string).length || (row[field] as string).length > (kind === "summary" ? 180 : 60)) throw new Error(`${field} 길이 오류`);
        }
      } else if (kind === "input") {
        if (typeof row.usageDuration !== "string") throw new Error("체류시간 원문 형식 오류");
      } else {
        const minutes = [row.minimumMinutes, row.typicalMinutes, row.maximumMinutes];
        if (!minutes.every((value) => Number.isInteger(value) && Number(value) >= 10 && Number(value) <= 720) ||
          Number(minutes[0]) > Number(minutes[1]) || Number(minutes[1]) > Number(minutes[2]) ||
          !Number.isInteger(row.confidence) || Number(row.confidence) < 0 || Number(row.confidence) > 100 ||
          typeof row.evidence !== "string" || !row.evidence.trim() ||
          !["llm_parsed", "manual_override", "type_default"].includes(String(row.source))) throw new Error("체류시간 구조화 형식 오류");
      }
      rows.push(row as Record<string, unknown> & { contentId: string });
    } catch (error) { errors.push(`${path}:${index + 1}: ${error instanceof Error ? error.message : "JSON 오류"}`); }
  }
  return rows;
}
