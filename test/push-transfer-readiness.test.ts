import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { pushTransferBlockers, readPushProviderEvidence } from "../src/server/legal/pushTransferReadiness";

const complete = { recipient: "Provider", contact: "https://example.test/privacy", items: "토큰", timingAndMethod: "TLS", purpose: "알림", retention: "확인한 제공자별 기간", refusal: "해제, 기본 기능 유지", countries: ["US"], legalBasis: "contract_necessary", contractReference: "CONTRACT-123", noticeReference: "NOTICE-123", nativeVerificationReference: "NATIVE-123" };
test("포괄적 완료 표시만으로 국가·기간·근거가 없는 푸시 안내를 승인하지 않는다", () => {
  const blockers = pushTransferBlockers("fcm", { confirmed: true, reference: "APPROVED-123" });
  for (const field of ["countries", "legalBasis", "retention", "contractReference", "noticeReference", "nativeVerificationReference"]) assert.ok(blockers.includes(`pushTransfer.fcm.${field}`));
  assert.deepEqual(readPushProviderEvidence({ confirmed: true }), {});
  assert.deepEqual(pushTransferBlockers("fcm", complete), []);
});
test("별도 동의와 계약 이행 근거를 구분하고 미확정 표현은 승인하지 않는다", () => {
  assert.deepEqual(pushTransferBlockers("apns", { ...complete, legalBasis: "separate_consent" }), ["pushTransfer.apns.consentReference"]);
  assert.deepEqual(pushTransferBlockers("apns", { ...complete, legalBasis: "separate_consent", consentReference: "CONSENT-123" }), []);
  assert.ok(pushTransferBlockers("fcm", { ...complete, countries: ["미국 등"], retention: "확인 필요" }).includes("pushTransfer.fcm.countries"));
  assert.ok(pushTransferBlockers("fcm", { ...complete, countries: [] }).includes("pushTransfer.fcm.countries"));
  assert.ok(pushTransferBlockers("fcm", { ...complete, contractReference: "private@example.test" }).includes("pushTransfer.fcm.contractReference"));
});

test("FCM 답신 반영은 확인한 보관 기준만 채우고 국가·실제 동의·기기 검증을 자동 승인하지 않는다", () => {
  const evidence = JSON.parse(readFileSync("docs/legal/readiness-status.json", "utf8"));
  const fcm = evidence.pushTransferReview.providers.fcm;
  const apns = evidence.pushTransferReview.providers.apns;
  assert.equal(fcm.supportResponse.received, true);
  assert.equal(fcm.contractReview.standardContractEntity, "Google LLC");
  assert.equal(fcm.supportResponse.countryNoticeLegallyApproved, false);
  assert.match(fcm.retention, /180일/);
  assert.match(fcm.retention, /28일/);
  assert.match(fcm.retention, /통상 수 주/);
  const blockers = pushTransferBlockers("fcm", fcm);
  for (const field of ["countries", "consentReference", "noticeReference", "nativeVerificationReference"]) {
    assert.ok(blockers.includes(`pushTransfer.fcm.${field}`));
  }
  assert.equal(blockers.includes("pushTransfer.fcm.retention"), false);
  assert.equal(apns.retention, null);
  assert.equal(apns.legalBasis, null);
  assert.deepEqual(apns.countries, []);
});
