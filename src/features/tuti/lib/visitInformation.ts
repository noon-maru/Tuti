import type { TourismPlaceDetail } from "@/shared/api/placeDetails";

export type VisitInformationFact = {
  key: "openingHours" | "restDate" | "usageDuration" | "admissionFee" | "parking";
  label: string;
  value: string;
  needsVerification: boolean;
};

const uncertainInformationPattern =
  /정보\s*(?:없음|없)|확인|문의|상이|변동|별도|현장/;

export function createVisitInformationFacts(
  detail: TourismPlaceDetail | null,
): VisitInformationFact[] {
  const facts: VisitInformationFact[] = [
    createRequiredFact(
      "openingHours",
      "이용 시간",
      detail?.openingHours,
      "운영 시간 정보 없음",
      detail?.isStale,
    ),
    createRequiredFact(
      "restDate",
      "쉬는 날",
      detail?.restDate,
      "휴무일 정보 없음",
      detail?.isStale,
    ),
  ];

  if (detail?.usageDuration) {
    facts.push({
      key: "usageDuration",
      label: "머무는 시간",
      value: detail.usageDuration,
      needsVerification: isUncertain(detail.usageDuration, detail.isStale),
    });
  }

  facts.push(
    createRequiredFact(
      "admissionFee",
      "이용 요금",
      detail?.admissionFee,
      "요금 정보 없음",
      detail?.isStale,
    ),
  );

  if (detail?.parking) {
    facts.push({
      key: "parking",
      label: "주차",
      value: detail.parking,
      needsVerification: isUncertain(detail.parking, detail.isStale),
    });
  }

  return facts;
}

export function createOperationBadge(
  detail: TourismPlaceDetail | null,
  now = new Date(),
) {
  if (!detail || detail.isStale) return "운영 정보 확인 필요";

  const restDate = compactLabel(detail.restDate);
  if (restDate && /연중\s*무휴|연중무휴/.test(restDate)) {
    return "오늘 운영";
  }
  if (restDate && isRestDay(restDate, now)) return "오늘 휴무";

  return detail.openingHours || restDate
    ? "오늘 운영 여부 확인 필요"
    : "운영 정보 확인 필요";
}

function createRequiredFact(
  key: VisitInformationFact["key"],
  label: string,
  value: string | null | undefined,
  fallback: string,
  isStale = false,
): VisitInformationFact {
  const normalized = compactLabel(value);
  return {
    key,
    label,
    value: normalized ?? fallback,
    needsVerification: !normalized || isUncertain(normalized, isStale),
  };
}

function isUncertain(value: string, isStale: boolean) {
  return isStale || uncertainInformationPattern.test(value);
}

function isRestDay(restDate: string, date: Date) {
  const parts = getKoreanDateParts(date);
  if (
    new RegExp(`${parts.month}\\s*월\\s*0?${parts.day}\\s*일`).test(restDate)
  ) {
    return true;
  }

  const weekday = ["일", "월", "화", "수", "목", "금", "토"][parts.weekday];
  if (!weekday || !mentionsWeekday(restDate, weekday)) return false;

  const mentionedWeeks = ["첫째", "둘째", "셋째", "넷째", "다섯째"]
    .map((label, index) => (restDate.includes(label) ? index + 1 : null))
    .filter((week): week is number => week !== null);
  return (
    mentionedWeeks.length === 0 ||
    mentionedWeeks.includes(Math.ceil(parts.day / 7))
  );
}

function getKoreanDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    month: Number(value("month")),
    day: Number(value("day")),
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
      value("weekday"),
    ),
  };
}

function mentionsWeekday(text: string, weekday: string) {
  return (
    text.includes(`${weekday}요일`) ||
    new RegExp(`(^|[\\s,·/()])${weekday}(?=$|[\\s,·/()])`).test(text)
  );
}

function compactLabel(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim() || null;
}
