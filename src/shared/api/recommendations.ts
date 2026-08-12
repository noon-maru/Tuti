import type { TutiPlace } from "@/lib/recommendations";
import type {
  IntakeAnswers,
  PreferredRegion,
  UserLocation,
} from "@/shared/tuti/types";

export const RECOMMENDATION_ALGORITHM_VERSION = "verified-transport-hubs-v9";

export type RecommendationErrorCode = "long_distance_unavailable";

export type RecommendationErrorResponse = {
  error: string;
  code?: RecommendationErrorCode;
};

export type RecommendationRequest = {
  answers?: IntakeAnswers;
  location?: UserLocation;
  preferredRegion?: PreferredRegion;
  excludePlaceIds?: string[];
  stateText?: string;
  entryStatus?: "answered" | "reused" | "skipped";
};

export type RecommendationResponse = {
  recommendationId: string;
  algorithmVersion: string;
  places: TutiPlace[];
};
