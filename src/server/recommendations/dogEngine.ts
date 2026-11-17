import type { TutiPlace } from "@/lib/recommendations";
import { prisma } from "@/server/db/prisma";
import { dogOutingPlaces } from "@/server/pets/dogAccess";
import type { DogOuting } from "@/shared/pets/dogAccess";
import type { IntakeAnswers, PreferredRegion, UserLocation } from "@/shared/tuti/types";
import type { PersonalizationAudit } from "@/server/personalization/ranking";
import { getPreferredRegionWhere } from "./regionFallback";
import { dogCatalogPlaceWhere } from "./dogPlaceWhere";
import { derivePlaceExperienceType } from "./experienceType";
import { enrichPlacesWithKnownExecutionFeasibility, type OperationDetail } from "./executionFeasibility";
import { filterPlacesByAdmissionBudget } from "./admissionFee";
import { loadPlaceNoveltySignals } from "./novelty";
import { rankDogPlaces, selectDogPlaces } from "./dogRanking";
import { enrichPlacesWithCachedWeather } from "@/server/weather/kmaVilageForecast";
import { requireLocationForLongDistance } from "./longDistanceAvailability";

export const DOG_ENGINE_VERSION = "dog-outing-v1";
export type DogRecommendationAudit = { algorithmVersion: string; catalogReady: number; areaCandidates: number; distanceEligible: number; companionEligible: number; budgetEligible: number; returned: number; conditionsProvided: boolean };
export const dogDistancePolicy = { near: 5000, short: 20000, half: 60000, far: 200000 } as const;
export function dogDistanceMeters(a: UserLocation, b: UserLocation) {
  const radians = (value: number) => value * Math.PI / 180;
  const h = Math.sin(radians(b.latitude - a.latitude) / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(radians(b.longitude - a.longitude) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(Math.min(1, h)), Math.sqrt(Math.max(0, 1 - h)));
}

export async function createDogRecommendations(input: { answers: IntakeAnswers; location?: UserLocation; preferredRegion?: PreferredRegion; excludePlaceIds?: string[]; preferencePlaceIds?: string[]; userId?: string; dogOuting?: DogOuting; now?: Date }) {
  const { answers, location, preferredRegion, dogOuting } = input, now = input.now ?? new Date();
  const movement = answers.movement ?? "near", radius = dogDistancePolicy[movement];
  requireLocationForLongDistance(movement, location);
  if (!location && !preferredRegion) throw Error("DOG_RECOMMENDATION_AREA_REQUIRED");
  const bounds = location ? { latitude: { gte: location.latitude - radius / 110000, lte: location.latitude + radius / 110000 }, longitude: { gte: location.longitude - radius / (110000 * Math.cos(location.latitude * Math.PI / 180)), lte: location.longitude + radius / (110000 * Math.cos(location.latitude * Math.PI / 180)) } } : {};
  const where = { AND: [dogCatalogPlaceWhere, { latitude: { gte: 32, lte: 40 }, longitude: { gte: 124, lte: 133 } }, bounds, ...(!location && preferredRegion ? [getPreferredRegionWhere(preferredRegion)] : [])] };
  // No LIMIT before dog eligibility/ranking: an unrelated nearby venue cannot hide a dog candidate.
  const [catalogReady, rows] = await Promise.all([
    prisma.dogPlaceCatalog.count({ where: { status: "ready" } }),
    prisma.place.findMany({ where, orderBy: { id: "asc" }, select: {
      id: true, name: true, image: true, sourceContentType: true, sourceSidoName: true, sourceSigunguName: true,
      latitude: true, longitude: true, experienceType: true, visitTimeProfile: true,
      tourismSourceRecord: { select: { detailRecord: { select: { overview: true, openingHours: true, restDate: true, admissionFee: true } } } },
    } }),
  ]);
  const saved = new Set(input.preferencePlaceIds ?? []);
  const operationDetails = new Map<string, OperationDetail>();
  const distanceCandidates = rows.flatMap(row => {
    const distance = location ? dogDistanceMeters(location, { latitude: Number(row.latitude), longitude: Number(row.longitude) }) : undefined;
    if (saved.has(row.id) || distance !== undefined && (distance > radius || answers.transport === "car" && distance < 2000)) return [];
    if (/폐업|영구\s*폐쇄|운영\s*종료/.test(`${row.name} ${row.tourismSourceRecord?.detailRecord?.overview ?? ""}`)) return [];
    if (row.tourismSourceRecord?.detailRecord) operationDetails.set(row.id, row.tourismSourceRecord.detailRecord);
    const base: TutiPlace = { id: row.id, name: row.name, image: row.image, phrase: "반려견과 함께할 다음 하루", note: "방문 전 동반 구역과 세부 조건을 확인해주세요.", travelTime: "이동 시간 확인 필요", crowd: "정보 없음", today: "운영 정보 확인 필요", fatigue: 0, movementLevel: "near", moodTags: [], latitude: Number(row.latitude), longitude: Number(row.longitude), distanceMeters: distance, sourceContentType: row.sourceContentType ?? undefined, sourceSidoName: row.sourceSidoName ?? undefined, sourceSigunguName: row.sourceSigunguName ?? undefined, ...(row.visitTimeProfile ? { visitTimeProfile: row.visitTimeProfile } : {}) };
    base.experienceType = derivePlaceExperienceType({ ...base, overview: row.tourismSourceRecord?.detailRecord?.overview });
    return [base];
  });
  const companions = await dogOutingPlaces(distanceCandidates, dogOuting);
  const enriched = enrichPlacesWithKnownExecutionFeasibility(enrichPlacesWithCachedWeather(companions, now), answers, operationDetails, now);
  // Unknown/estimated time is not grounds for silently deleting a candidate. Known admission limits remain hard constraints.
  const budgetEligible = filterPlacesByAdmissionBudget(enriched, answers.budget);
  const signals = await loadPlaceNoveltySignals(input.userId, budgetEligible.map(p => p.id), now);
  const ranked = rankDogPlaces(budgetEligible, dogOuting, signals);
  const places = selectDogPlaces(ranked, input.excludePlaceIds ?? [], 6);
  const audit: DogRecommendationAudit = { algorithmVersion: DOG_ENGINE_VERSION, catalogReady, areaCandidates: rows.length, distanceEligible: distanceCandidates.length, companionEligible: companions.length, budgetEligible: budgetEligible.length, returned: places.length, conditionsProvided: Boolean(dogOuting) };
  const personalization: PersonalizationAudit = { mode: "off", profileVersion: DOG_ENGINE_VERSION, applied: false, scoredPlaceCount: 0, originalPlaceIds: ranked.map(p => p.id) };
  return { places, personalization, audit };
}
