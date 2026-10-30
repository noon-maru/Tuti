// All product metrics use ordinary, non-QA accounts. Operational audits do not.
export const analyticsUserWhere = { role: "user", analyticsExcludedAt: null } as const;
export const ANALYTICS_DAY_MS = 86_400_000;
const KST_OFFSET = 9 * 3_600_000;
export function koreanDay(value: Date) {
  return Math.floor((value.getTime() + KST_OFFSET) / ANALYTICS_DAY_MS);
}
export function normalizeAnalyticsDays(value: string | null): 7 | 30 | 90 {
  return value === "7" ? 7 : value === "90" ? 90 : 30;
}
export function analyticsPeriod(days: 7 | 30 | 90, now = new Date()) {
  if (!Number.isFinite(now.getTime())) throw new Error("INVALID_ANALYTICS_TIME");
  const today = koreanDay(now) * ANALYTICS_DAY_MS - KST_OFFSET;
  const start = new Date(today - (days - 1) * ANALYTICS_DAY_MS);
  // Half-open range, inclusive of the observed instant, never future events.
  const end = new Date(now.getTime() + 1);
  return { days, start, end, asOf: now.toISOString(),
    previousStart: new Date(start.getTime() - days * ANALYTICS_DAY_MS), previousEnd: start };
}
export function metricRate(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Math.round(numerator / denominator * 1000) / 10 : null;
}
