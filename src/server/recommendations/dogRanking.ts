import type { TutiPlace } from "@/lib/recommendations";
import type { DogOuting } from "@/shared/pets/dogAccess";
import type { DogScore } from "@/shared/api/dogRecommendation";
export type { DogScore } from "@/shared/api/dogRecommendation";
import type { PlaceNoveltySignal } from "./novelty";
import { noveltyBoost } from "./novelty";
import { matchesDogPurpose } from "./dogDestination";

/** Positive evidence bonuses only. Legacy fatigue/energy/low-burden scores never enter this function. */
export function scoreDogPlace(place: TutiPlace, outing?: DogOuting, novelty?: Omit<PlaceNoveltySignal, "placeId">): DogScore {
  const access = place.dogAccess?.kind !== "tourapi" && place.dogAccess ? 6 : 0;
  const facility = place.dogAccess?.kind === "tourapi" && /반려견.*(?:놀이터|운동장)|도그런|애견.*운동장/.test(place.dogAccess.facilities ?? "") ? 6 : 0;
  const walkTypes = ["forest_garden", "waterside", "neighborhood"];
  const purpose = outing?.purpose === "cafe" && place.experienceType === "cafe" || outing?.purpose === "walk" && walkTypes.includes(place.experienceType ?? "") ? 18 : outing?.purpose === "outing" && place.experienceType && !["cafe", "other"].includes(place.experienceType) ? 12 : 0;
  const distance = place.distanceMeters === undefined ? 0 : 30 / (1 + Math.max(0, place.distanceMeters) / 5000);
  const fit = place.executionFeasibility;
  const time = fit?.fitStatus === "comfortable" ? 12 : fit?.fitStatus === "possible" ? 6 : 0;
  // No inference that a cafe is indoor or a park has shade. Unknown/poor weather receives no bonus.
  const weather = place.weatherForecast?.suitability === "good" ? 4 : 0;
  const fresh = novelty ? noveltyBoost(novelty) : 0;
  return { access, facility, purpose, distance, time, weather, novelty: fresh, total: access + facility + purpose + distance + time + weather + fresh };
}

export function rankDogPlaces(places: TutiPlace[], outing?: DogOuting, signals: PlaceNoveltySignal[] | null = null) {
  const byId = new Map(signals?.map(signal => [signal.placeId, signal]) ?? []);
  return places.map(place => {
    const score = scoreDogPlace(place, outing, byId.get(place.id));
    return { ...place, dogRecommendationScore: score, rankingScore: -score.total,
      reason: outing?.purpose === "cafe" && place.experienceType === "cafe" ? "함께 쉬어갈 카페를 찾고 있다면" : outing?.purpose === "walk" && ["forest_garden", "waterside", "neighborhood"].includes(place.experienceType ?? "") ? "함께 걸을 다음 길을 찾고 있다면" : "반려견과 함께할 다음 하루",
      reasonDetail: place.dogAccess?.kind === "tourapi" ? "공식 동반 등록 장소예요. 방문 전 동반 구역과 세부 조건을 확인해주세요." : "안내된 동반 조건과 준비물을 확인하고 골라보세요.",
      reasonFactors: ["companion", ...(place.distanceMeters === undefined ? [] : ["distance"])] as TutiPlace["reasonFactors"],
      cardPhrase: outing?.purpose === "cafe" && place.experienceType === "cafe" ? "함께 쉬어갈 다음 공간" : "함께할 다음 하루를 찾아서",
    };
  }).sort((a, b) => b.dogRecommendationScore.total - a.dogRecommendationScore.total || a.id.localeCompare(b.id));
}

export function selectDogPlaces(places: TutiPlace[], previousIds: string[], limit = 6, outing?: DogOuting) {
  const previous = new Set(previousIds), result: TutiPlace[] = [], counts = new Map<string, number>();
  const matching = places.filter(p => matchesDogPurpose(p, outing));
  for (const group of [matching.filter(p => !previous.has(p.id)), matching.filter(p => previous.has(p.id))]) {
    const deferred: TutiPlace[] = [];
    for (const place of group) {
      const type = place.experienceType ?? "other";
      if ((counts.get(type) ?? 0) >= 2) { deferred.push(place); continue; }
      if (result.length >= limit) break;
      result.push(place); counts.set(type, (counts.get(type) ?? 0) + 1);
    }
    for (const place of deferred) { if (result.length >= limit) break; result.push(place); }
    if (result.length >= limit) break;
  }
  return result;
}
