export type UserActivitySignals = {
  productActions: string[];
  recommendationRuns: number;
  recommendationActions: string[];
  journalCount: number;
};

export type UserActivityStage =
  | "created"
  | "visited"
  | "recommended"
  | "engaged"
  | "converted";

const ENGAGEMENT_ACTIONS = new Set([
  "place_selected",
  "departure_peek_opened",
  "departure_plan_expanded",
  "journal_started",
]);

const CONVERSION_ACTIONS = new Set([
  "navigation_started",
  "return_confirmed",
  "journal_created",
]);

export function resolveUserActivityStage(
  signals: UserActivitySignals,
): UserActivityStage {
  if (
    signals.journalCount > 0 ||
    signals.recommendationActions.some((action) =>
      CONVERSION_ACTIONS.has(action),
    )
  ) {
    return "converted";
  }

  if (
    signals.recommendationActions.some((action) =>
      ENGAGEMENT_ACTIONS.has(action),
    )
  ) {
    return "engaged";
  }

  if (signals.recommendationRuns > 0) return "recommended";
  if (signals.productActions.length > 0) return "visited";
  return "created";
}

export function isMeaningfulActivityStage(stage: UserActivityStage) {
  return stage === "recommended" || stage === "engaged" || stage === "converted";
}
