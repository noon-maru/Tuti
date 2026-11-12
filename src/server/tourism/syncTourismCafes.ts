import { createHash } from "node:crypto";
import { prisma } from "@/server/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { CAFE_CATEGORY_CODES, cafeCategoryFromPayload, classifyCafe, type CafeCategoryCode } from "./cafeClassification";
import { fetchTourApiPage, type TourApiPlaceItem } from "./tourApiClient";
import { normalizeTourApiPlace } from "./syncTourismPlaces";
import { resolveTourApiRegionLabels } from "@/shared/tourism/tourApiRegions";

export async function fetchTourismCafePage(input: {
  categoryCode: CafeCategoryCode; pageNo: number; numOfRows: number; regionCode?: string; districtCode?: string;
}) {
  if (!CAFE_CATEGORY_CODES.includes(input.categoryCode)) throw new Error("카페·찻집 분류만 수집할 수 있습니다.");
  return fetchTourApiPage<TourApiPlaceItem>("areaBasedList2", {
    contentTypeId: "39", lclsSystm1: "FD", lclsSystm2: "FD05", lclsSystm3: input.categoryCode,
    pageNo: String(input.pageNo), numOfRows: String(input.numOfRows), arrange: "A",
    ...(input.regionCode ? { lDongRegnCd: input.regionCode } : {}),
    ...(input.districtCode ? { lDongSignguCd: input.districtCode } : {}),
  });
}

export function planTourismCafeImport(items: TourApiPlaceItem[]) {
  const seen = new Set<string>();
  const accepted: TourApiPlaceItem[] = [];
  const skipped: { contentId: string | null; reason: string }[] = [];
  for (const item of items) {
    const id = item.contentid?.trim();
    if (!id || !/^\d+$/.test(id) || !item.title?.trim()) { skipped.push({ contentId: id ?? null, reason: "INVALID_ID_OR_TITLE" }); continue; }
    if (seen.has(id)) continue;
    seen.add(id);
    const category = cafeCategoryFromPayload(item);
    if (item.contenttypeid !== "39" || !CAFE_CATEGORY_CODES.includes(category.categoryCode as CafeCategoryCode) ||
        classifyCafe({ name: item.title, contentTypeId: item.contenttypeid, ...category }).kind !== "venue") {
      skipped.push({ contentId: id, reason: "NOT_CONFIRMED_CAFE_OR_TEAHOUSE" }); continue;
    }
    accepted.push(item);
  }
  accepted.sort((a, b) => a.contentid!.localeCompare(b.contentid!));
  const canonical = accepted.map(item => Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))));
  const planHash = createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
  return { accepted, skipped, planHash };
}

export async function importTourismCafePlan(plan: ReturnType<typeof planTourismCafeImport>, expectedPlanHash: string, database = prisma) {
  const checked = planTourismCafeImport(plan.accepted);
  if (checked.skipped.length || checked.accepted.length !== plan.accepted.length || checked.planHash !== plan.planHash || expectedPlanHash !== plan.planHash) {
    throw new Error("수집 대상이 바뀌었습니다. 조회 결과를 다시 확인해주세요.");
  }
  if (plan.accepted.length > 200) throw new Error("한 번에 최대 200곳까지만 적용할 수 있습니다.");
  return database.$transaction(async tx => {
    // 외부 호출은 잠금 밖에서 끝내고 원천·장소·연결·좌표는 한 트랜잭션으로 반영한다.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(1418031941)`;
    let sourceRecords = 0, createdPlaces = 0, existingPlacesPreserved = 0, missingImageOrCoordinates = 0;
    for (const item of plan.accepted) {
      const id = item.contentid!.trim();
      const name = item.title!.replace(/<[^>]*>/g, " ").trim();
      const place = normalizeTourApiPlace(item);
      const region = resolveTourApiRegionLabels(item.areacode?.trim() || null, item.addr1 ?? null, item.lDongRegnCd);
      const prior = await tx.tourismPlaceSourceRecord.findUnique({ where: { contentId: id }, select: { linkedPlaceId: true } });
      const existing = await tx.place.findUnique({ where: { source_sourceId: { source: "tourapi", sourceId: id } }, select: { id: true } });
      if (prior?.linkedPlaceId && prior.linkedPlaceId !== existing?.id) throw new Error("장소 원천 연결이 일치하지 않습니다. 수집을 취소합니다.");
      const metadata = { contentTypeId: "39", title: name, rawPayload: item as Prisma.InputJsonValue,
        ...(place?.sourceModifiedAt ? { sourceModifiedAt: place.sourceModifiedAt } : {}),
        areaCode: item.lDongRegnCd ?? item.areacode ?? null, sidoName: region.sidoName,
        sigunguCode: item.lDongSignguCd ?? item.sigungucode ?? null, sigunguName: region.sigunguName, syncedAt: new Date() };
      await tx.tourismPlaceSourceRecord.upsert({ where: { contentId: id }, create: { contentId: id, ...metadata }, update: metadata });
      sourceRecords++;
      if (existing) {
        // 반려·숨김·수동 포함/제외·편집한 사진과 문구는 수집으로 덮어쓰지 않는다.
        await tx.tourismPlaceSourceRecord.update({ where: { contentId: id }, data: { linkedPlaceId: existing.id } });
        existingPlacesPreserved++; continue;
      }
      if (!place || place.latitude === 0 && place.longitude === 0) { missingImageOrCoordinates++; continue; }
      const placeId = `tourapi-${id}`;
      await tx.place.create({ data: {
        id: placeId, name: place.name, phrase: "음료 한 잔과 함께 잠시 머무는 시간", note: place.note, image: place.image,
        travelTime: "이동 시간 확인 필요", crowd: "정보 없음", today: "운영 정보 확인 필요",
        fatigue: 22, movementLevel: "near", moodTags: [], experienceType: "cafe", experienceTypeConfidence: 90,
        experienceTypeEvidence: ["관광공사 신분류 카페·찻집"], latitude: place.latitude.toFixed(6), longitude: place.longitude.toFixed(6),
        source: "tourapi", sourceId: id, sourceContentType: "39", sourceAddress: place.address, sourceAreaCode: place.areaCode,
        sourceSidoName: place.sidoName, sourceSigunguCode: place.sigunguCode, sourceSigunguName: place.sigunguName,
        sourceCopyright: place.copyright, sourceModifiedAt: place.sourceModifiedAt, sourceSyncedAt: new Date(),
        // 정기 후보 갱신이 pending을 자동 승인하더라도 수동 검토 전에는 추천하지 않는다.
        reviewStatus: "pending", isActive: false, candidateOverride: "exclude",
      } });
      await tx.$executeRaw`UPDATE places SET location = ST_SetSRID(ST_MakePoint(${place.longitude}, ${place.latitude}), 4326) WHERE id = ${placeId}`;
      await tx.tourismPlaceSourceRecord.update({ where: { contentId: id }, data: { linkedPlaceId: placeId } });
      createdPlaces++;
    }
    return { sourceRecords, createdPlaces, existingPlacesPreserved, missingImageOrCoordinates, automaticallyPublished: 0 };
  }, { maxWait: 10_000, timeout: 120_000 });
}
