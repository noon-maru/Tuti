import { getKoreanDateKey, getKoreanDateKeyAfterDays, getKoreanDateKeyFromIso } from "@/lib/date/koreanDate";
import { toActiveIntakeAnswers, type IntakeAnswers } from "@/shared/tuti/types";
import { outingMovement } from "@/shared/tuti/movementTimeBudget";
import { parseOutingCategories } from "@/shared/pets/outingCategories";

export const INTAKE_REASK_INTERVAL_DAYS = 7;

export function withDefaultIntakeAnswers(answers: IntakeAnswers = {}): IntakeAnswers {
  // Persisted JSON is not guaranteed to match today's TypeScript union.
  const stored = answers && typeof answers === "object" && !Array.isArray(answers) ? answers : {};
  const optional = <T extends string>(value: unknown, allowed: readonly T[]): T | undefined =>
    allowed.includes(value as T) ? value as T : undefined;
  const active = toActiveIntakeAnswers({
    petCompanion: optional(stored.petCompanion, ["dog", "none"]),
    movement: optional(stored.movement, ["near", "short", "half", "far"]),
    transport: optional(stored.transport, ["car", "transit"]),
    companion: optional(stored.companion, ["solo", "friend", "partner", "family"]),
    budget: optional(stored.budget, ["free", "under_20000"]),
    longDistanceTiming: optional(stored.longDistanceTiming, ["tomorrow_day_trip", "overnight_trip"]),
    ...(stored.petCompanion === "dog" && stored.placeCategories !== undefined
      ? { placeCategories: parseOutingCategories(stored.placeCategories) ?? [] } : {}),
  });
  return { ...active, petCompanion: active.petCompanion ?? "none", movement: outingMovement(active), transport: active.transport ?? "transit" };
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
