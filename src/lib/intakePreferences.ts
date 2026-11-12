import { getKoreanDateKey, getKoreanDateKeyAfterDays, getKoreanDateKeyFromIso } from "@/lib/date/koreanDate";
import { toActiveIntakeAnswers, type IntakeAnswers } from "@/shared/tuti/types";

export const INTAKE_REASK_INTERVAL_DAYS = 7;

export function withDefaultIntakeAnswers(answers: IntakeAnswers = {}): IntakeAnswers {
  const active = toActiveIntakeAnswers(answers);
  return { ...active, movement: active.movement ?? "near", transport: active.transport ?? "transit" };
}

// 답변 재확인 간격만 늘린다. 추천 자체의 날짜·위치·날씨 유효기간은 변경하지 않는다.
export function isIntakePreferenceCurrent(
  record?: { effectiveDate?: string; completedAt: string },
  currentDate = getKoreanDateKey(),
) {
  if (!record) return false;
  const date = record.effectiveDate ?? getKoreanDateKeyFromIso(record.completedAt);
  return Boolean(date && /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= currentDate &&
    currentDate < getKoreanDateKeyAfterDays(INTAKE_REASK_INTERVAL_DAYS, date));
}
