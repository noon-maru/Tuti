import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { tourApiDogAccess } from "@/shared/pets/tourApiDogAccess";
import { normalizeDogPlaceBasic, type DogPlaceBasicRecord } from "./dogPlaceBasic";

export const DOG_CATALOG_VERSION = "dog-outing-v1";
export type DogCatalogState = { status: "ready" | "review_required" | "excluded"; reason: string };
export function officialDogRestriction(raw: unknown): string | null {
  const text = raw && typeof raw === "object" ? (raw as Record<string, unknown>).acmpyPsblCpam : null;
  if (typeof text !== "string") return null;
  if (/^(?:동반\s*)?(?:불가|금지)\s*[.!]?$/u.test(text.trim())) return "official_pet_denial";
  if (/^(?:맹인\s*)?안내견(?:만|\s*전용)?$/u.test(text.trim())) return "official_assistance_dogs_only";
  return null;
}
export function dogCatalogState(place: { name: string; reviewStatus: string; visibilityOverride: string; candidateOverride: string }, official: boolean): DogCatalogState {
  if (place.visibilityOverride === "hide" || place.candidateOverride === "exclude") return { status: "excluded", reason: "operator_exclusion" };
  if (/폐업|영구\s*폐쇄|운영\s*종료/.test(place.name)) return { status: "excluded", reason: "closed" };
  // Historic rejected flags do not say who rejected them. Never silently undo a possible manual decision.
  if (place.reviewStatus === "rejected") return { status: "review_required", reason: "legacy_rejection_requires_review" };
  if (!official) return { status: "review_required", reason: "official_listing_missing_or_stale" };
  return { status: "ready", reason: "official_listing_and_valid_basic_data" };
}

export async function registerDogPlace(contentId: string, basicRecord: DogPlaceBasicRecord | null, apply = false, repairInvalidCoordinates = false) {
  if (!/^\d{1,20}$/.test(contentId)) throw Error("INVALID_CONTENT_ID");
  const basic = basicRecord ? normalizeDogPlaceBasic(basicRecord) : null;
  if (basic && basic.contentId !== contentId) throw Error("BASIC_ID_MISMATCH");
  return prisma.$transaction(async tx => {
    if (apply) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`dog-catalog:${contentId}`}))`;
    const source = await tx.tourismPetSourceRecord.findUnique({ where: { source_contentId: { source: "kor", contentId } } });
    if (!source) throw Error("KOREAN_SOURCE_REQUIRED");
    let place = await tx.place.findUnique({ where: { source_sourceId: { source: "tourapi", sourceId: contentId } }, select: { id: true, name: true, latitude: true, longitude: true, reviewStatus: true, visibilityOverride: true, candidateOverride: true } });
    const created = !place;
    if (!place && !basic) return { status: "missing_basic", created: false };
    let coordinates = place ? { latitude: Number(place.latitude), longitude: Number(place.longitude) } : basic!;
    const invalid = (point: { latitude: number; longitude: number }) => point.latitude < 32 || point.latitude > 40 || point.longitude < 124 || point.longitude > 133 || !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude);
    if (place && invalid(coordinates) && basic && repairInvalidCoordinates) {
      if (apply) {
        const result = await tx.place.updateMany({ where: { id: place.id, latitude: place.latitude, longitude: place.longitude }, data: { latitude: basic.latitude, longitude: basic.longitude } });
        if (result.count !== 1) throw Error("PLACE_COORDINATES_CHANGED");
        await tx.$executeRaw`UPDATE places SET location=ST_SetSRID(ST_MakePoint(${basic.longitude},${basic.latitude}),4326) WHERE id=${place.id}`;
      }
      coordinates = basic;
    }
    if (coordinates.latitude < 32 || coordinates.latitude > 40 || coordinates.longitude < 124 || coordinates.longitude > 133 || !Number.isFinite(coordinates.latitude) || !Number.isFinite(coordinates.longitude)) return { status: "invalid_basic", created: false };
    const state = dogCatalogState(place ?? { name: basic!.name, reviewStatus: "pending", visibilityOverride: "auto", candidateOverride: "auto" }, Boolean(tourApiDogAccess(source.rawPayload, source.fetchedAt)));
    const restriction = officialDogRestriction(source.rawPayload);
    if (state.reason === "official_listing_missing_or_stale" && restriction) { state.status = "excluded"; state.reason = restriction; }
    if (!apply) return { ...state, created };
    if (!place) {
      const p = basic!;
      place = await tx.place.create({ data: {
        id: `tourapi-${contentId}`, source: "tourapi", sourceId: contentId, name: p.name,
        phrase: "반려견과 함께할 다음 하루", note: "공식 동반 등록 정보가 있는 장소예요. 방문 전 세부 조건을 확인해주세요.",
        image: p.image, travelTime: "이동 시간 확인 필요", crowd: "정보 없음", today: "운영 정보 확인 필요",
        fatigue: 0, movementLevel: "near", moodTags: [], latitude: p.latitude, longitude: p.longitude,
        sourceAddress: p.address, sourceContentType: p.contentTypeId, sourceAreaCode: p.areaCode,
        sourceSidoName: p.sidoName, sourceSigunguCode: p.sigunguCode, sourceSigunguName: p.sigunguName,
        sourceCopyright: p.copyright, sourceSyncedAt: new Date(basicRecord!.fetchedAt),
        reviewStatus: "pending", isActive: false,
      }, select: { id: true, name: true, latitude: true, longitude: true, reviewStatus: true, visibilityOverride: true, candidateOverride: true } });
      await tx.$executeRaw`UPDATE places SET location=ST_SetSRID(ST_MakePoint(${p.longitude},${p.latitude}),4326) WHERE id=${place.id}`;
    }
    const prior = await tx.dogPlaceCatalog.findUnique({ where: { placeId: place.id } });
    const safeState = prior?.status === "excluded" ? { status: "excluded", reason: prior.reason } : state;
    if (basicRecord && basic) {
      const priorSource = await tx.tourismPlaceSourceRecord.findUnique({ where: { contentId }, select: { linkedPlaceId: true } });
      if (priorSource?.linkedPlaceId && priorSource.linkedPlaceId !== place.id) throw Error("PLACE_LINK_CONFLICT");
      await tx.tourismPlaceSourceRecord.upsert({ where: { contentId }, create: {
        contentId, title: basic.name, contentTypeId: basic.contentTypeId, areaCode: basic.areaCode, sidoName: basic.sidoName,
        sigunguCode: basic.sigunguCode, sigunguName: basic.sigunguName, rawPayload: basicRecord.item as Prisma.InputJsonObject,
        linkedPlaceId: place.id, syncedAt: new Date(basicRecord.fetchedAt),
      }, update: { linkedPlaceId: place.id } });
    }
    await tx.tourismPetSourceRecord.update({ where: { source_contentId: { source: "kor", contentId } }, data: { placeId: place.id } });
    await tx.dogPlaceCatalog.upsert({ where: { placeId: place.id }, create: { placeId: place.id, ...safeState, basicSource: basicRecord?.source ?? "existing-place", algorithmVersion: DOG_CATALOG_VERSION }, update: { ...safeState, algorithmVersion: DOG_CATALOG_VERSION } });
    return { ...safeState, created };
  }, { timeout: 10000 });
}
