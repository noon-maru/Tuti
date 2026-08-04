import type { TutiPlace } from "@/lib/recommendations";
import type { IntakeAnswers, UserLocation } from "@/shared/tuti/types";

export type RecommendationRequest = {
  answers?: IntakeAnswers;
  location?: UserLocation;
  stateText?: string;
  entryStatus?: "answered" | "reused" | "skipped";
};

export type RecommendationResponse = {
  recommendationId: string;
  places: TutiPlace[];
};
