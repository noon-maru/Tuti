import type {
  PreferredRegion,
  UserLocation,
} from "@/shared/tuti/types";

export function hasRecommendationArea(
  location: UserLocation | undefined,
  preferredRegion: PreferredRegion | undefined,
) {
  return Boolean(location || preferredRegion?.sigunguName.trim());
}
