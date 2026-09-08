import type {
  IntakeAnswers,
  PreferredRegion,
  UserLocation,
} from "@/shared/tuti/types";

type RecommendationInput = {
  answers: IntakeAnswers;
  userLocation?: UserLocation;
  preferredRegion?: PreferredRegion;
  excludedPlaceIds: string[];
  entryStatus?: "answered" | "reused" | "skipped";
};

export function createRecommendationInputFingerprint({
  answers,
  userLocation,
  preferredRegion,
  excludedPlaceIds,
  entryStatus,
}: RecommendationInput) {
  const canonicalInput = JSON.stringify({
    answers: {
      movement: answers.movement ?? null,
      air: answers.air ?? null,
      density: answers.density ?? null,
      companion: answers.companion ?? null,
      budget: answers.budget ?? null,
      longDistanceTiming: answers.longDistanceTiming ?? null,
    },
    userLocation: userLocation
      ? {
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
        }
      : null,
    preferredRegion: preferredRegion
      ? {
          areaCode: preferredRegion.areaCode,
          name: preferredRegion.name,
        }
      : null,
    excludedPlaceIds: [...excludedPlaceIds].sort(),
    entryStatus: entryStatus ?? null,
  });

  return `recommendation-input-v1:${fnv1a64(canonicalInput)}`;
}

function fnv1a64(value: string) {
  let hash = 0xcbf29ce484222325n;

  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }

  return hash.toString(16).padStart(16, "0");
}
