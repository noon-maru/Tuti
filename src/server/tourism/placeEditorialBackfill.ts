import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { normalizeTourApiPlaceDetail } from "./enrichTourismPlaceDetail";
import type { TourApiDetailItem } from "./tourApiDetailClient";
import { prisma } from "@/server/db/prisma";
import { readablePlaceWhere } from "@/server/recommendations/dogPlaceWhere";
import { createPlaceOverviewSummaryFingerprint, PLACE_OVERVIEW_SUMMARY_MODEL, PLACE_OVERVIEW_SUMMARY_VERSION } from "./placeOverviewSummary";

export const editorialBackfillSelection = {
  id: true, name: true, sourceId: true, sourceAddress: true, sourceContentType: true, suggestedAction: true, updatedAt: true,
  tourismSourceRecord: { select: { detailRecord: { select: {
    contentId: true, contentTypeId: true, overview: true, overviewSummary: true, summarySourceFingerprint: true,
    experienceGuide: true, commonPayload: true, introPayload: true, infoPayload: true, updatedAt: true,
  } } } },
} satisfies Prisma.PlaceSelect;
export type EditorialBackfillRow = Prisma.PlaceGetPayload<{ select: typeof editorialBackfillSelection }>;

export function editorialSource(row: EditorialBackfillRow) {
  const detail = row.tourismSourceRecord?.detailRecord;
  const raw = detail ? normalizeTourApiPlaceDetail({ common: detail.commonPayload as TourApiDetailItem | null,
    intro: detail.introPayload as TourApiDetailItem | null, info: [], images: [] }).fields : undefined;
  return { contentId: row.sourceId ?? "", name: row.name, address: row.sourceAddress, contentTypeId: detail?.contentTypeId ?? row.sourceContentType,
    overview: detail?.overview?.trim() || raw?.overview || null,
    experienceGuide: detail?.experienceGuide ?? null };
}

export function editorialSourceFingerprint(row: EditorialBackfillRow) {
  return createHash("sha256").update(JSON.stringify(editorialSource(row))).digest("hex");
}

async function lockEditorialSources(transaction: Prisma.TransactionClient, rows: EditorialBackfillRow[]) {
  if (!rows.length) return;
  const places = await transaction.$queryRaw<Array<{ id: string; updatedAt: Date }>>(Prisma.sql`
    SELECT id, updated_at AS "updatedAt" FROM places WHERE id IN (${Prisma.join(rows.map(row => row.id))}) ORDER BY id FOR UPDATE`);
  const details = await transaction.$queryRaw<Array<{ contentId: string; updatedAt: Date }>>(Prisma.sql`
    SELECT content_id AS "contentId", updated_at AS "updatedAt" FROM tourism_place_detail_records
    WHERE content_id IN (${Prisma.join(rows.map(row => row.tourismSourceRecord!.detailRecord!.contentId))}) ORDER BY content_id FOR UPDATE`);
  if (places.length !== rows.length || details.length !== rows.length || rows.some(row =>
    places.find(place => place.id === row.id)?.updatedAt.getTime() !== row.updatedAt.getTime() ||
    details.find(detail => detail.contentId === row.tourismSourceRecord!.detailRecord!.contentId)?.updatedAt.getTime() !== row.tourismSourceRecord!.detailRecord!.updatedAt.getTime())) {
    throw new Error("검토 이후 장소 또는 원문이 변경되었습니다.");
  }
}

export type AuthoredEditorial = { contentId: string; sourceFingerprint: string; summary: string; action: string };

export function parseAuthoredEditorials(contents: string): AuthoredEditorial[] {
  const seen = new Set<string>();
  return contents.split(/\r?\n/).filter(line => line.trim()).map((line, index) => {
    const item = JSON.parse(line) as AuthoredEditorial;
    if (!item || typeof item !== "object" || Object.keys(item).sort().join(",") !== "action,contentId,sourceFingerprint,summary" ||
      typeof item.contentId !== "string" || !/^\d+$/.test(item.contentId) || typeof item.sourceFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(item.sourceFingerprint) ||
      typeof item.summary !== "string" || typeof item.action !== "string") throw new Error(`입력 ${index + 1}행 형식 오류`);
    const summary = item.summary.replace(/\s+/g, " ").trim(), action = item.action.replace(/\s+/g, " ").trim();
    if (!summary || summary.length > 180 || !action || action.length > 60 || seen.has(item.contentId)) throw new Error(`입력 ${index + 1}행 길이/중복 오류`);
    seen.add(item.contentId);
    return { ...item, summary, action };
  });
}

export function prepareEditorialBackfill(rows: EditorialBackfillRow[], authored: AuthoredEditorial[]) {
  if (new Set(authored.map(item => item.contentId)).size !== authored.length) throw new Error("파일 사이 contentId 중복");
  const updates = authored.flatMap(item => {
    const matches = rows.filter(row => row.sourceId === item.contentId);
    if (matches.length !== 1) throw new Error(`추천 대상 또는 식별자 불일치: ${item.contentId}`);
    const row = matches[0], detail = row.tourismSourceRecord?.detailRecord;
    if (!detail || detail.contentId !== item.contentId || editorialSourceFingerprint(row) !== item.sourceFingerprint) throw new Error(`원문 변경/상세 누락: ${item.contentId}`);
    const source = editorialSource(row);
    const summary = !detail.overviewSummary?.trim() ? item.summary : undefined;
    const action = !row.suggestedAction?.trim() ? item.action : undefined;
    if (summary && !source.overview) throw new Error(`소개 근거 부족: ${item.contentId}`);
    return summary || action ? [{ row, item, summary, action, overview: detail.overview?.trim() ? detail.overview : source.overview }] : [];
  });
  const planHash = createHash("sha256").update(JSON.stringify(updates.map(update => ({
    id: update.row.id, placeUpdatedAt: update.row.updatedAt, detailUpdatedAt: update.row.tourismSourceRecord!.detailRecord!.updatedAt,
    sourceFingerprint: update.item.sourceFingerprint, summary: update.summary, action: update.action,
  })))).digest("hex");
  return { updates, planHash, supplied: authored.length };
}

export async function applyEditorialBackfill(plan: ReturnType<typeof prepareEditorialBackfill>, expectedPlanHash: string) {
  if (plan.planHash !== expectedPlanHash) throw new Error("승인한 계획 해시와 다릅니다.");
  return prisma.$transaction(async transaction => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(1418031911)`;
    await lockEditorialSources(transaction, plan.updates.map(update => update.row));
    const eligible = await transaction.place.count({ where: { AND: [readablePlaceWhere, { id: { in: plan.updates.map(update => update.row.id) } }] } });
    if (eligible !== plan.updates.length) throw new Error("반영 전 추천 범위가 변경되었습니다.");
    const generatedAt = new Date();
    for (const { row, item, summary, action, overview } of plan.updates) {
      const detail = row.tourismSourceRecord!.detailRecord!;
      if (summary) {
        const result = await transaction.tourismPlaceDetailRecord.updateMany({ where: { contentId: item.contentId, updatedAt: detail.updatedAt, overviewSummary: detail.overviewSummary }, data: {
          ...(!detail.overview?.trim() && overview ? { overview } : {}), overviewSummary: summary,
          summarySourceFingerprint: createPlaceOverviewSummaryFingerprint({ contentTypeId: detail.contentTypeId, overview, experienceGuide: detail.experienceGuide }),
          summaryModel: PLACE_OVERVIEW_SUMMARY_MODEL, summaryVersion: PLACE_OVERVIEW_SUMMARY_VERSION, summaryGeneratedAt: generatedAt,
        } });
        if (result.count !== 1) throw new Error(`소개가 동시에 수정됐습니다: ${item.contentId}`);
      }
      if (action) {
        const result = await transaction.place.updateMany({ where: { id: row.id, updatedAt: row.updatedAt, suggestedAction: row.suggestedAction }, data: { suggestedAction: action } });
        if (result.count !== 1) throw new Error(`행동이 동시에 수정됐습니다: ${item.contentId}`);
      }
    }
    return { places: plan.updates.length, summaries: plan.updates.filter(update => update.summary).length, actions: plan.updates.filter(update => update.action).length };
  }, { maxWait: 30_000, timeout: 300_000 });
}

export type ReviewedEditorial = { contentId: string; sourceFingerprint: string; existingSummary: string; approved: boolean; reason: string };

export function parseReviewedEditorials(contents: string): ReviewedEditorial[] {
  const seen = new Set<string>();
  return contents.split(/\r?\n/).filter(line => line.trim()).map((line, index) => {
    const item = JSON.parse(line) as ReviewedEditorial;
    if (!item || Object.keys(item).sort().join(",") !== "approved,contentId,existingSummary,reason,sourceFingerprint" ||
      typeof item.contentId !== "string" || !/^\d+$/.test(item.contentId) || seen.has(item.contentId) ||
      typeof item.sourceFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(item.sourceFingerprint) ||
      typeof item.existingSummary !== "string" || !item.existingSummary.trim() || typeof item.approved !== "boolean" ||
      typeof item.reason !== "string" || !item.reason.trim() || item.reason.length > 200) throw new Error(`검토 ${index + 1}행 형식/중복 오류`);
    seen.add(item.contentId);
    return item;
  });
}

export function prepareReviewedEditorials(rows: EditorialBackfillRow[], reviews: ReviewedEditorial[]) {
  if (new Set(reviews.map(item => item.contentId)).size !== reviews.length) throw new Error("파일 사이 검토 ID 중복");
  const updates = reviews.filter(review => review.approved).flatMap(review => {
    const matches = rows.filter(row => row.sourceId === review.contentId);
    if (matches.length !== 1) throw new Error(`검토 추천 범위 불일치: ${review.contentId}`);
    const row = matches[0], detail = row.tourismSourceRecord?.detailRecord;
    if (!detail || detail.overviewSummary !== review.existingSummary || editorialSourceFingerprint(row) !== review.sourceFingerprint) throw new Error(`검토 이후 원문/문구 변경: ${review.contentId}`);
    const fingerprint = createPlaceOverviewSummaryFingerprint(detail);
    return fingerprint !== detail.summarySourceFingerprint ? [{ row, review, fingerprint }] : [];
  });
  const planHash = createHash("sha256").update(JSON.stringify(updates.map(({ row, review, fingerprint }) => ({
    id: row.id, placeUpdatedAt: row.updatedAt, detailUpdatedAt: row.tourismSourceRecord!.detailRecord!.updatedAt, review, fingerprint,
  })))).digest("hex");
  return { updates, planHash, supplied: reviews.length, approved: reviews.filter(review => review.approved).length, needsReview: reviews.filter(review => !review.approved).length };
}

export async function applyReviewedEditorials(plan: ReturnType<typeof prepareReviewedEditorials>, expectedPlanHash: string) {
  if (plan.planHash !== expectedPlanHash) throw new Error("검토 승인 해시와 다릅니다.");
  return prisma.$transaction(async transaction => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(1418031911)`;
    await lockEditorialSources(transaction, plan.updates.map(update => update.row));
    const eligible = await transaction.place.count({ where: { AND: [readablePlaceWhere, { id: { in: plan.updates.map(update => update.row.id) } }] } });
    if (eligible !== plan.updates.length) throw new Error("검토 반영 전 추천 범위 변경");
    for (const { row, review, fingerprint } of plan.updates) {
      const detail = row.tourismSourceRecord!.detailRecord!;
      const result = await transaction.tourismPlaceDetailRecord.updateMany({ where: {
        contentId: review.contentId, updatedAt: detail.updatedAt, overviewSummary: review.existingSummary, summarySourceFingerprint: detail.summarySourceFingerprint,
      }, data: { summarySourceFingerprint: fingerprint } });
      if (result.count !== 1) throw new Error(`검토 요약 동시 수정: ${review.contentId}`);
    }
    return { revalidated: plan.updates.length, existingSummaryTextChanged: false, needsReview: plan.needsReview };
  }, { maxWait: 30_000, timeout: 300_000 });
}
