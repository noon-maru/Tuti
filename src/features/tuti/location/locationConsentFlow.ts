import { getLocationTermsVersion } from "@/shared/location/terms";
import type { LocationConsentRecord } from "@/shared/tuti/types";

export function canUseLocationWithoutConsentPrompt(
  consent: LocationConsentRecord | undefined,
) {
  return consent?.termsVersion === getLocationTermsVersion() &&
    (consent.status === "accepted" || consent.status === "paused");
}

export function isPausedLocationConsent(
  consent: LocationConsentRecord | undefined,
) {
  return consent?.status === "paused" &&
    consent.termsVersion === getLocationTermsVersion();
}
