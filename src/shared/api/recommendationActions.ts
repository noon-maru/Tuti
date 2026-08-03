import type { DepartureRouteMode } from "@/shared/api/departurePlan";

export const RECOMMENDATION_ACTION_TYPES = [
  "recommendation_shown",
  "place_selected",
  "departure_peek_opened",
  "departure_plan_expanded",
  "navigation_started",
  "return_confirmed",
  "return_dismissed",
  "return_deferred",
  "journal_started",
  "journal_created",
] as const;

export type RecommendationActionType =
  (typeof RECOMMENDATION_ACTION_TYPES)[number];

export type RecommendationActionInput = {
  journeyId: string;
  action: RecommendationActionType;
  placeId?: string;
  routeMode?: DepartureRouteMode;
  metadata?: Record<string, string | number | boolean | null>;
};

export type RecommendationActionResponse = {
  recorded: true;
};
