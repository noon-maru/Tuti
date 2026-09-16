export type RecommendationStatus = "loading" | "error" | "empty" | "ready";
export const RECOMMENDATION_DISPLAY_LIMIT = 6;
export type RecommendationNotice = "limited_results" | "location_precision";

export function getRecommendationStatus({
  loading,
  recommendationError,
  placeCount,
}: {
  loading: boolean;
  recommendationError: boolean;
  placeCount: number;
}): RecommendationStatus {
  if (loading) return "loading";
  if (recommendationError) return "error";
  return placeCount === 0 ? "empty" : "ready";
}

export function hasLimitedRecommendationResults({
  loading,
  recommendationError,
  placeCount,
}: {
  loading: boolean;
  recommendationError: boolean;
  placeCount: number;
}) {
  return !loading &&
    !recommendationError &&
    placeCount > 0 &&
    placeCount < RECOMMENDATION_DISPLAY_LIMIT;
}

export function getRecommendationNoticeQueue({
  loading,
  recommendationError,
  placeCount,
  locationAvailable,
}: {
  loading: boolean;
  recommendationError: boolean;
  placeCount: number;
  locationAvailable: boolean;
}): RecommendationNotice[] {
  if (loading || recommendationError || placeCount === 0) return [];
  return [
    ...(placeCount < RECOMMENDATION_DISPLAY_LIMIT
      ? ["limited_results" as const]
      : []),
    ...(!locationAvailable ? ["location_precision" as const] : []),
  ];
}
