import type { TutiPlace } from "@/lib/recommendations";
import type {
  IntakeAnswers,
  PreferredRegion,
  UserLocation,
} from "@/shared/tuti/types";

export const RECOMMENDATION_ALGORITHM_VERSION = "low-burden-distance-v5";

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
