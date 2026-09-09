import type { UserLocation } from "@/shared/tuti/types";

export const LONG_DISTANCE_UNAVAILABLE_CODE =
  "long_distance_unavailable" as const;
export const LONG_DISTANCE_LOCATION_REQUIRED_CODE =
  "long_distance_location_required" as const;

export class LongDistanceRecommendationsUnavailableError extends Error {
  readonly code:
    | typeof LONG_DISTANCE_UNAVAILABLE_CODE
    | typeof LONG_DISTANCE_LOCATION_REQUIRED_CODE;

  constructor(
    code:
      | typeof LONG_DISTANCE_UNAVAILABLE_CODE
      | typeof LONG_DISTANCE_LOCATION_REQUIRED_CODE =
      LONG_DISTANCE_UNAVAILABLE_CODE,
  ) {
    super("장거리 대중교통 여정을 준비하지 못했어요.");
    this.code = code;
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
    throw new LongDistanceRecommendationsUnavailableError(
      LONG_DISTANCE_LOCATION_REQUIRED_CODE,
    );
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
