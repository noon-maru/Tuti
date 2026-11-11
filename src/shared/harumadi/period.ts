export type HarumadiPeriod = { periodStart?: string | null; periodEnd?: string | null };
export const HARUMADI_TITLE_IDEAS = ["제주에서 보낸 사흘", "우리의 첫 캠핑", "함께한 이번 가을", "우리 강아지의 첫해"] as const;
function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
/** A memory's time range, never a posting deadline or membership expiry. */
export function parseHarumadiPeriod(input: Record<string, unknown>): HarumadiPeriod | null {
  if (input.periodStart === undefined && input.periodEnd === undefined) return {};
  if (input.periodStart === null && input.periodEnd === null) return { periodStart: null, periodEnd: null };
  if (!validDate(input.periodStart) || !validDate(input.periodEnd) || input.periodStart > input.periodEnd) return null;
  return { periodStart: input.periodStart, periodEnd: input.periodEnd };
}
export function harumadiPeriodLabel(period: HarumadiPeriod) {
  if (!period.periodStart || !period.periodEnd || !parseHarumadiPeriod({ ...period })) return "";
  const start = period.periodStart.replaceAll("-", "."), end = period.periodEnd.replaceAll("-", ".");
  return start === end ? start : `${start} – ${end}`;
}
export function serializeHarumadiPeriod(row: { periodStart?: Date | null; periodEnd?: Date | null }): HarumadiPeriod {
  return row.periodStart && row.periodEnd ? { periodStart: row.periodStart.toISOString().slice(0, 10), periodEnd: row.periodEnd.toISOString().slice(0, 10) } : {};
}
export function harumadiPeriodData(period: HarumadiPeriod) {
  return period.periodStart === undefined && period.periodEnd === undefined ? {} : {
    periodStart: period.periodStart ? new Date(`${period.periodStart}T00:00:00Z`) : null,
    periodEnd: period.periodEnd ? new Date(`${period.periodEnd}T00:00:00Z`) : null,
  };
}
