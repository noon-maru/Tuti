import type { TutiPlace } from "@/lib/recommendations";
import type {
  IntakeAnswers,
  PreferredRegion,
  UserLocation,
} from "@/shared/tuti/types";

export const RECOMMENDATION_ALGORITHM_VERSION = "experience-intent-v25";

export type RecommendationErrorCode =
  | "long_distance_unavailable"
  | "long_distance_location_required"
  | "recommendation_location_required"
  | "recommendation_location_invalid"
  | "recommendation_region_invalid"
  | "location_auth_required"
  | "location_consent_required"
  | "location_consent_outdated"
  | "location_consent_record_failed"
  | "network_error";

export type RecommendationErrorResponse = {
  error: string;
  code?: RecommendationErrorCode;
};

export type RecommendationRequest = {
  answers?: IntakeAnswers;
  location?: UserLocation;
  preferredRegion?: PreferredRegion;
  excludePlaceIds?: string[];
  preferencePlaceIds?: string[];
  entryStatus?: "answered" | "reused" | "skipped";
};

export type RecommendationResponse = {
  recommendationId: string;
  algorithmVersion: string;
  places: TutiPlace[];
};
