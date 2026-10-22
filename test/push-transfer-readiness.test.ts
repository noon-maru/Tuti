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

test("답신·판단 위임의 한정적 글로벌 고지를 반영해도 실제 공고·기기 검증은 승인하지 않는다", () => {
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
  for (const field of ["noticeReference", "nativeVerificationReference"]) {
    assert.ok(blockers.includes(`pushTransfer.fcm.${field}`));
  }
  assert.equal(blockers.includes("pushTransfer.fcm.retention"), false);
  assert.equal(blockers.includes("pushTransfer.fcm.countries"), false);
  assert.equal(blockers.includes("pushTransfer.fcm.consentReference"), false);
  assert.equal(evidence.pushTransferReview.countriesConfirmed, false);
  assert.equal(apns.legalBasis, "contract_necessary");
  assert.equal(apns.countryScope, "global_facilities");
  assert.match(apns.retention, /고정 상한을 임의 설정하지 않으며/);
});

test("글로벌 범위는 미국 단독 목록으로 숨기지 않고 제공자 원문·범위 설명·판단 근거를 함께 요구한다", () => {
  const global = { ...complete, countryScope: "global_facilities",
    countryScopeDescription: "미국 및 제공자의 글로벌 처리시설 국가. US는 수령자 소재국이며 한정 목록이 아님",
    countryScopeReviewReference: "LEGAL-TEXT-DECISION-20261022", countryScopeSources: ["https://firebase.google.com/support/privacy"] };
  assert.deepEqual(pushTransferBlockers("fcm", global), []);
  for (const change of [
    { countryScopeReviewReference: null }, { countryScopeDescription: "" },
    { countryScopeSources: ["https://example.test/privacy"] },
    { countryScopeSources: ["http://firebase.google.com/support/privacy"] },
    { countryScopeSources: ["https://firebase.google.com.evil.test/privacy"] },
    { countries: [] }, { countryScope: "global" },
  ]) assert.ok(pushTransferBlockers("fcm", { ...global, ...change }).includes("pushTransfer.fcm.countries"));
  assert.ok(pushTransferBlockers("apns", global).includes("pushTransfer.apns.countries"));
});
