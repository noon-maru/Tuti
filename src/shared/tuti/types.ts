export type MovementAnswer = "near" | "short" | "half" | "far";
export type AirAnswer = "quiet" | "open" | "walk";
export type DensityAnswer = "quiet" | "balanced" | "lively";
export type CompanionAnswer = "solo" | "friend" | "partner" | "family";
export type BudgetAnswer = "free" | "under_20000";
export type LongDistanceTimingAnswer =
  | "tomorrow_day_trip"
  | "overnight_trip";

export type IntakeAnswers = {
  movement?: MovementAnswer;
  air?: AirAnswer;
  density?: DensityAnswer;
  companion?: CompanionAnswer;
  budget?: BudgetAnswer;
  longDistanceTiming?: LongDistanceTimingAnswer;
};

export type UserLocation = {
  latitude: number;
  longitude: number;
};

export type PreferredRegion = {
  areaCode: string;
  name: string;
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
