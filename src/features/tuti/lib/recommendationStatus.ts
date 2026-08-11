export type RecommendationStatus = "loading" | "error" | "empty" | "ready";

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
