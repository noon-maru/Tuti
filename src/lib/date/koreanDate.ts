export function getKoreanDateKey(date: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function getKoreanDateKeyFromIso(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : getKoreanDateKey(date);
}

export function getKoreanDateKeyAfterDays(
  days: number,
  dateKey = getKoreanDateKey(),
) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function isKoreanDateBefore(date: string, endDate?: string) {
  return Boolean(endDate && date < endDate);
}

export function isCurrentKoreanDate(
  record?: {
    effectiveDate?: string;
    completedAt: string;
  },
  currentDate = getKoreanDateKey(),
) {
  if (!record) return false;

  const effectiveDate =
    record.effectiveDate ?? getKoreanDateKeyFromIso(record.completedAt);

  return effectiveDate === currentDate;
}
