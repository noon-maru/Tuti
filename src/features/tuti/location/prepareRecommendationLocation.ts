import { hasRecommendationArea } from "@/shared/location/recommendationArea";
import type { PreferredRegion, UserLocation } from "@/shared/tuti/types";

type RecommendationArea = {
  userLocation?: UserLocation;
  preferredRegion?: PreferredRegion;
};

export async function prepareRecommendationLocation(
  readArea: () => RecommendationArea,
  requestLocation: () => Promise<unknown>,
) {
  const current = readArea();
  if (hasRecommendationArea(current.userLocation, current.preferredRegion)) return;

  // This promise also waits for region selection when device location fails.
  await requestLocation();
  const resolved = readArea();
  if (!hasRecommendationArea(resolved.userLocation, resolved.preferredRegion)) {
    throw new Error("현재 위치를 확인하거나 추천받을 지역을 선택해주세요.");
  }
}
