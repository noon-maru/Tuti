export type MovementAnswer = "near" | "short" | "half" | "far";
export type TransportAnswer = "car" | "transit";
/** @deprecated 신규 질문에서는 사용하지 않으며 이전 추천 기록 호환용으로만 남긴다. */
export type AirAnswer = "quiet" | "open" | "walk";
/** @deprecated 신규 질문에서는 사용하지 않으며 이전 추천 기록 호환용으로만 남긴다. */
export type DensityAnswer = "quiet" | "balanced" | "lively";
export type CompanionAnswer = "solo" | "friend" | "partner" | "family";
export type BudgetAnswer = "free" | "under_20000";
export type LongDistanceTimingAnswer =
  | "tomorrow_day_trip"
  | "overnight_trip";

export type IntakeAnswers = {
  movement?: MovementAnswer;
  transport?: TransportAnswer;
  /** @deprecated 이전 앱 버전의 저장값 및 추천 기록 호환용 */
  air?: AirAnswer;
  /** @deprecated 이전 앱 버전의 저장값 및 추천 기록 호환용 */
  density?: DensityAnswer;
  companion?: CompanionAnswer;
  budget?: BudgetAnswer;
  longDistanceTiming?: LongDistanceTimingAnswer;
};

export function toActiveIntakeAnswers(
  answers: IntakeAnswers,
): IntakeAnswers {
  return {
    movement: answers.movement,
    transport: answers.transport,
    companion: answers.companion,
    budget: answers.budget,
    ...(answers.movement === "far"
      ? { longDistanceTiming: answers.longDistanceTiming }
      : {}),
  };
}

export type UserLocation = {
  latitude: number;
  longitude: number;
};

export type PreferredRegion = {
  areaCode: string;
  name: string;
  sigunguCode?: string;
  sigunguName: string;
};

export type LocationConsentStatus =
  | "accepted"
  | "paused"
  | "declined"
  | "withdrawn";

export type LocationAcquisitionSource = "device" | "photo_exif";
export type LocationUsageService =
  | "recommendation"
  | "travel_time"
  | "departure_plan"
  | "photo_nearby";
export type LocationUsageKind = "internal_use" | "external_transfer";

export type LocationConsentRecord = {
  status: LocationConsentStatus;
  termsVersion: string;
  updatedAt: string;
};

export type LocationPermissionStatus =
  | "unknown"
  | "prompt"
  | "granted"
  | "denied"
  | "unavailable"
  | "timeout";
