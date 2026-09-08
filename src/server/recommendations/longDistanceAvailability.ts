import type { UserLocation } from "@/shared/tuti/types";

export const LONG_DISTANCE_UNAVAILABLE_CODE =
  "long_distance_unavailable" as const;

export class LongDistanceRecommendationsUnavailableError extends Error {
  readonly code = LONG_DISTANCE_UNAVAILABLE_CODE;

  constructor() {
    super("장거리 대중교통 여정을 준비하지 못했어요.");
    this.name = "LongDistanceRecommendationsUnavailableError";
  }
}

export function requireLongDistanceRecommendations<T>(places: T[]) {
  if (places.length === 0) {
    throw new LongDistanceRecommendationsUnavailableError();
  }

  return places;
}

export function requireLocationForLongDistance(
  movement: "near" | "short" | "half" | "far",
  location?: UserLocation,
) {
  if (movement === "far" && !location) {
    throw new LongDistanceRecommendationsUnavailableError();
  }
}

export function requireNearbyMovement(
  movement: "near" | "short" | "half" | "far",
) {
  if (movement === "far") {
    throw new LongDistanceRecommendationsUnavailableError();
  }

  return movement;
}
