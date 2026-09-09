export type RecommendationStatus = "loading" | "error" | "empty" | "ready";
export const RECOMMENDATION_DISPLAY_LIMIT = 6;

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
