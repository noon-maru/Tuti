export type MovementAnswer = "near" | "short" | "half";
export type AirAnswer = "quiet" | "open" | "walk";
export type DensityAnswer = "quiet" | "balanced" | "lively";

export type IntakeAnswers = {
  movement?: MovementAnswer;
  air?: AirAnswer;
  density?: DensityAnswer;
};

export type UserLocation = {
  latitude: number;
  longitude: number;
};

export type LocationConsentStatus =
  | "accepted"
  | "declined"
  | "withdrawn";

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
