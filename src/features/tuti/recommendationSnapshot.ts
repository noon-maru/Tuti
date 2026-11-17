import { createRecommendationInputFingerprint } from "./recommendationInputFingerprint";
import type { IntakeAnswers, PreferredRegion, UserLocation } from "@/shared/tuti/types";
import { parseDogOuting, type DogOuting } from "@/shared/pets/dogAccess";
import type { DailyRecommendationSnapshot } from "@/store/tuti";

export const RECOMMENDATION_MOVEMENT_METERS = 1_000;

export function recommendationConditionsKey(answers: IntakeAnswers, dogOuting?: DogOuting) {
  // 시간·오늘 날짜·GPS 오차·찜/기록 변경은 새 추천 의도가 아니다.
  const dog = answers.petCompanion === "dog" ? parseDogOuting(dogOuting) ?? undefined : undefined;
  return JSON.stringify([createRecommendationInputFingerprint({ answers, excludedPlaceIds: [] }), {
    weightsKg: [...(dog?.weightsKg ?? [])].sort((a, b) => a - b),
    leash: dog?.leash ?? null, carrier: dog?.carrier ?? null, muzzle: dog?.muzzle ?? null,
    space: dog?.space ?? "any", purpose: dog?.purpose ?? null,
    categories: [...(dog?.categories ?? [])].sort(),
  }]);
}

export function recommendationRegionKey(region?: PreferredRegion) {
  return JSON.stringify(region ? [region.areaCode, region.sigunguCode ?? null, region.sigunguName] : null);
}

export function distanceMeters(a: UserLocation, b: UserLocation) {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLng = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

export function hasMovedRecommendationOrigin(anchor: UserLocation, current: UserLocation) {
  // 두 위치의 오차 범위를 빼고도 1km 이상이어야 한다. 저정확도 한 번으로 뒤집지 않는다.
  return distanceMeters(anchor, current) - (anchor.accuracy ?? 0) - (current.accuracy ?? 0) >= RECOMMENDATION_MOVEMENT_METERS;
}

/** Old/corrupted local JSON must not crash the carousel; valid lists never expire by age/version. */
export function isValidRecommendationSnapshot(value: unknown): value is DailyRecommendationSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as DailyRecommendationSnapshot;
  const anchor = snapshot.locationAnchor;
  if (snapshot.snapshotVersion !== 1 || typeof snapshot.ownerId !== "string" || !snapshot.ownerId ||
    !Number.isSafeInteger(snapshot.cycle) || snapshot.cycle < 0 || typeof snapshot.recommendationId !== "string" || !snapshot.recommendationId ||
    typeof snapshot.algorithmVersion !== "string" || typeof snapshot.inputFingerprint !== "string" ||
    !Array.isArray(snapshot.places) || snapshot.places.length > 6) return false;
  if (anchor && (!Number.isFinite(anchor.latitude) || Math.abs(anchor.latitude) > 90 || !Number.isFinite(anchor.longitude) || Math.abs(anchor.longitude) > 180 ||
    (anchor.accuracy !== undefined && (!Number.isFinite(anchor.accuracy) || anchor.accuracy < 0)))) return false;
  const ids = new Set<string>();
  return snapshot.places.every(place => {
    if (!place || typeof place !== "object" || typeof place.id !== "string" || !place.id || ids.has(place.id) ||
      typeof place.name !== "string" || !place.name.trim() || !Array.isArray(place.moodTags) || place.moodTags.some(tag => typeof tag !== "string") ||
      !Number.isFinite(place.fatigue) || !["near", "short", "half"].includes(place.movementLevel) ||
      [place.image, place.phrase, place.note, place.travelTime, place.crowd, place.today].some(field => typeof field !== "string")) return false;
    ids.add(place.id);
    return true;
  });
}

export function reusableRecommendation(snapshot: DailyRecommendationSnapshot | undefined, input: {
  ownerId?: string; cycle: number; conditionsKey: string; location?: UserLocation; region?: PreferredRegion;
}) {
  if (!isValidRecommendationSnapshot(snapshot) || !input.ownerId || snapshot.ownerId !== input.ownerId ||
    snapshot.cycle !== input.cycle || snapshot.inputFingerprint !== input.conditionsKey) return undefined;
  if (snapshot.locationAnchor) {
    if (input.location && hasMovedRecommendationOrigin(snapshot.locationAnchor, input.location)) return undefined;
    // 현재 위치 복원/일시 실패 중에는 기존 목록을 먼저 보여준다.
    if (!input.location && snapshot.regionKey !== recommendationRegionKey(input.region)) return undefined;
  } else if (input.location || snapshot.regionKey !== recommendationRegionKey(input.region)) return undefined;
  return snapshot;
}
