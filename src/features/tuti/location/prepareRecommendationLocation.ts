import { hasRecommendationArea } from "@/shared/location/recommendationArea";
import type { LocationConsentRecord, PreferredRegion, UserLocation } from "@/shared/tuti/types";
import { getLocationTermsVersion } from "@/shared/location/terms";

type RecommendationArea = {
  userLocation?: UserLocation;
  preferredRegion?: PreferredRegion;
  locationConsent?: LocationConsentRecord;
  recommendationLocationSource?: "device" | "region";
};

/** 좌표는 영구 저장하지 않는다. 현재 위치를 쓰는 선택이면 작은 여행에서 다시 확보한다. */
export function shouldRestoreDeviceLocation(area: RecommendationArea) {
  return !area.userLocation && area.recommendationLocationSource !== "region" &&
    area.locationConsent?.status === "accepted" && area.locationConsent.termsVersion === getLocationTermsVersion();
}

export function isRecommendationLocationReady(area: RecommendationArea) {
  return hasRecommendationArea(area.userLocation, area.preferredRegion) && !shouldRestoreDeviceLocation(area);
}

export function needsRecommendationRegionChoice(area: RecommendationArea) {
  return !hasRecommendationArea(area.userLocation, area.preferredRegion) &&
    (area.recommendationLocationSource === "region" || area.locationConsent?.status === "paused" || area.locationConsent?.status === "withdrawn" || area.locationConsent?.status === "declined");
}

export async function prepareRecommendationLocation(
  readArea: () => RecommendationArea,
  requestLocation: () => Promise<unknown>,
) {
  const current = readArea();
  if (isRecommendationLocationReady(current)) return;
  if (needsRecommendationRegionChoice(current)) throw new Error("추천받을 지역을 선택해주세요.");

  // This promise also waits for region selection when device location fails.
  await requestLocation();
  const resolved = readArea();
  if (!isRecommendationLocationReady(resolved)) {
    throw new Error("현재 위치를 확인하거나 추천받을 지역을 선택해주세요.");
  }
}
