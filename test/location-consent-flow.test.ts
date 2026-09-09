import assert from "node:assert/strict";
import test from "node:test";
import {
  canUseLocationWithoutConsentPrompt,
  isPausedLocationConsent,
} from "@/features/tuti/location/locationConsentFlow";
import { LOCATION_TERMS_VERSION } from "@/shared/location/terms";
import type { LocationConsentRecord } from "@/shared/tuti/types";

function consent(
  status: LocationConsentRecord["status"],
  termsVersion = LOCATION_TERMS_VERSION,
): LocationConsentRecord {
  return {
    status,
    termsVersion,
    updatedAt: "2026-09-09T00:00:00.000Z",
  };
}

test("현재 약관에서 잠시 중단한 위치 사용은 재동의 없이 재개할 수 있다", () => {
  assert.equal(canUseLocationWithoutConsentPrompt(consent("paused")), true);
  assert.equal(isPausedLocationConsent(consent("paused")), true);
});

test("철회·거부 또는 이전 약관 상태에서는 위치 동의를 다시 받는다", () => {
  assert.equal(canUseLocationWithoutConsentPrompt(consent("withdrawn")), false);
  assert.equal(canUseLocationWithoutConsentPrompt(consent("declined")), false);
  assert.equal(
    canUseLocationWithoutConsentPrompt(consent("paused", "previous-version")),
    false,
  );
  assert.equal(isPausedLocationConsent(consent("withdrawn")), false);
});
