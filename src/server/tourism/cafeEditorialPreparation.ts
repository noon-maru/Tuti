import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { cafeCategoryFromPayload, classifyCafe } from "./cafeClassification";
import { createPlaceOverviewSummaryFingerprint, PLACE_OVERVIEW_SUMMARY_MODEL, PLACE_OVERVIEW_SUMMARY_VERSION } from "./placeOverviewSummary";
import { derivePlaceRecommendationFeatures, PLACE_RECOMMENDATION_FEATURE_VERSION } from "@/server/recommendations/placeRecommendationFeatures";
import { deriveVisitAccessProfile, getDefaultStayDurationProfile, createPlaceVisitTimeSourceFingerprint, PLACE_VISIT_TIME_DEFAULT_MODEL, PLACE_VISIT_TIME_PROFILE_VERSION } from "@/server/recommendations/placeVisitTimeProfile";

export const cafeEditorialSelection = { id: true, name: true, source: true, sourceId: true, sourceContentType: true, sourceAddress: true,
  image: true, reviewStatus: true, candidateOverride: true, visibilityOverride: true, isActive: true, updatedAt: true, suggestedAction: true,
  visitTimeProfile: true, tourismSourceRecord: { select: { rawPayload: true, detailRecord: true } } } as const;
export type CafeEditorialRow = Prisma.PlaceGetPayload<{ select: typeof cafeEditorialSelection }>;
export type AuthoredCafeEditorial = { contentId: string; sourceFingerprint: string; summary: string; action: string };

export function prepareCafeEditorials(rows: CafeEditorialRow[], authored: AuthoredCafeEditorial[]) {
  if (!authored.length || authored.length > 50 || rows.length !== authored.length || new Set(authored.map(item => item.contentId)).size !== authored.length) throw new Error("카페 보강 대상 수를 확인해주세요.");
  const updates = authored.map(item => {
    if (!/^\d+$/.test(item.contentId) || !/^[a-f0-9]{64}$/.test(item.sourceFingerprint) || !item.summary.trim() || item.summary.length > 180 || !item.action.trim() || item.action.length > 60) throw new Error("작성한 카페 문구를 확인해주세요.");
    const row = rows.find(value => value.sourceId === item.contentId);
    const detail = row?.tourismSourceRecord?.detailRecord;
    const category = cafeCategoryFromPayload(row?.tourismSourceRecord?.rawPayload);
    if (!row || row.source !== "tourapi" || row.sourceContentType !== "39" || !row.image.trim() || !detail?.overview?.trim() ||
      row.reviewStatus !== "pending" || row.candidateOverride !== "exclude" || row.isActive || row.visibilityOverride !== "auto" ||
      classifyCafe({ name: row.name, contentTypeId: row.sourceContentType, ...category }).kind !== "venue") throw new Error("검토 잠금 중인 카페만 보강할 수 있습니다.");
    if (createPlaceOverviewSummaryFingerprint(detail) !== item.sourceFingerprint) throw new Error("검토 이후 카페 원문이 변경됐습니다.");
    if (detail.usageDuration?.trim()) throw new Error("명시된 체류시간은 별도 구조화 검토가 필요합니다.");
    if (detail.overviewSummary && detail.overviewSummary !== item.summary || row.suggestedAction && row.suggestedAction !== item.action || row.visitTimeProfile && row.visitTimeProfile.staySource !== "type_default") throw new Error("기존 편집 문구나 수동 체류시간을 덮어쓸 수 없습니다.");
    const features = derivePlaceRecommendationFeatures({ name: row.name, contentTypeId: row.sourceContentType, address: row.sourceAddress, overview: detail.overview, experienceGuide: detail.experienceGuide, reservation: detail.reservation, ...category });
    const source = { name: row.name, contentTypeId: row.sourceContentType, experienceType: features.experienceType,
      overview: detail.overview, overviewSummary: item.summary, experienceGuide: detail.experienceGuide,
      usageDuration: detail.usageDuration, reservation: detail.reservation, parking: detail.parking, admissionFee: detail.admissionFee };
    const stay = getDefaultStayDurationProfile(source), access = deriveVisitAccessProfile(source);
    const profile = { stayMinimumMinutes: stay.minimumMinutes, stayTypicalMinutes: stay.typicalMinutes, stayMaximumMinutes: stay.maximumMinutes,
      staySource: "type_default", stayFlexibility: access.stayFlexibility, parkingAvailability: access.parkingAvailability, carSuitability: access.carSuitability,
      entryProcess: access.entryProcess, reservationRequirement: access.reservationRequirement, accessConstraint: access.accessConstraint,
      parkingBufferMinimumMinutes: access.parkingBuffer.minimumMinutes, parkingBufferTypicalMinutes: access.parkingBuffer.typicalMinutes, parkingBufferMaximumMinutes: access.parkingBuffer.maximumMinutes,
      entryBufferMinimumMinutes: access.entryBuffer.minimumMinutes, entryBufferTypicalMinutes: access.entryBuffer.typicalMinutes, entryBufferMaximumMinutes: access.entryBuffer.maximumMinutes,
      confidence: stay.confidence, evidence: [stay.evidence], fallbackFields: ["stayDuration", ...(access.parkingAvailability === "unknown" ? ["parkingAvailability"] : [])],
      sourceFingerprint: createPlaceVisitTimeSourceFingerprint(source), model: PLACE_VISIT_TIME_DEFAULT_MODEL, profileVersion: PLACE_VISIT_TIME_PROFILE_VERSION };
    return { row, detail, item, features, profile };
  }).sort((a, b) => a.item.contentId.localeCompare(b.item.contentId));
  const planHash = createHash("sha256").update(JSON.stringify(updates.map(({ row, detail, item, features, profile }) => ({
    placeId: row.id, placeUpdatedAt: row.updatedAt, detailUpdatedAt: detail.updatedAt, profileUpdatedAt: row.visitTimeProfile?.updatedAt,
    item, features, profile,
  })))).digest("hex");
  return { planHash, updates };
}

export async function applyCafeEditorials(plan: ReturnType<typeof prepareCafeEditorials>, expectedPlanHash: string, database = prisma) {
  const checked = prepareCafeEditorials(plan.updates.map(item => item.row), plan.updates.map(item => item.item));
  if (expectedPlanHash !== plan.planHash || checked.planHash !== plan.planHash) throw new Error("카페 보강 대상이 변경됐습니다. 다시 확인해주세요.");
  return database.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(1418031911)`;
    const generatedAt = new Date();
    for (const { row, detail, item, features, profile } of checked.updates) {
      const written = await tx.place.updateMany({ where: { id: row.id, updatedAt: row.updatedAt, reviewStatus: "pending", candidateOverride: "exclude", isActive: false, visibilityOverride: "auto" },
        data: { suggestedAction: item.action, ...features, recommendationFeatureVersion: PLACE_RECOMMENDATION_FEATURE_VERSION, recommendationFeatureDerivedAt: generatedAt } });
      if (written.count !== 1) throw new Error("장소가 동시에 변경돼 보강을 취소합니다.");
      const saved = await tx.tourismPlaceDetailRecord.updateMany({ where: { contentId: item.contentId, updatedAt: detail.updatedAt }, data: {
        overviewSummary: item.summary, summarySourceFingerprint: item.sourceFingerprint, summaryModel: PLACE_OVERVIEW_SUMMARY_MODEL, summaryVersion: PLACE_OVERVIEW_SUMMARY_VERSION, summaryGeneratedAt: generatedAt,
      } });
      if (saved.count !== 1) throw new Error("원문이 동시에 변경돼 보강을 취소합니다.");
      if (row.visitTimeProfile) {
        const changed = await tx.placeVisitTimeProfile.updateMany({ where: { placeId: row.id, updatedAt: row.visitTimeProfile.updatedAt, staySource: "type_default" }, data: { ...profile, generatedAt } });
        if (changed.count !== 1) throw new Error("체류시간이 동시에 변경돼 보강을 취소합니다.");
      } else await tx.placeVisitTimeProfile.create({ data: { placeId: row.id, ...profile, generatedAt } });
    }
    return { prepared: plan.updates.length, published: 0 };
  }, { maxWait: 10_000, timeout: 60_000 });
}
