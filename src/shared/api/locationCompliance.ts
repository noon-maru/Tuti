import type { LocationConsentStatus } from "@/shared/tuti/types";

export type LocationConsentUpdate = {
  status: LocationConsentStatus;
  termsVersion: string;
  ageConfirmed: boolean;
  clientPlatform: "web" | "ios" | "android";
};

export type LocationConsentServerRecord = {
  status: LocationConsentStatus;
  termsVersion: string;
  ageConfirmed: boolean;
  updatedAt: string;
};

export type LocationConsentResponse = {
  consent: LocationConsentServerRecord | null;
};

export type LocationComplianceErrorCode =
  | "location_auth_required"
  | "location_consent_required"
  | "location_consent_outdated"
  | "location_consent_record_failed"
  | "external_location_processing_pending";

export type LocationComplianceErrorResponse = {
  error: string;
  code: LocationComplianceErrorCode;
};
