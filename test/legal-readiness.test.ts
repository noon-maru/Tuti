import assert from "node:assert/strict";
import test from "node:test";
import { LEGAL_MANUAL_CHECKS, legalRuntimeFacts, legalReadinessBlockers, parseLegalReadinessEvidence } from "@/server/legal/readiness";

const pending = { owner: "정연한", contact: "admin@tuti.today", backupRetentionDays: 30, approvedDocumentHash: null, checks: {} };
const provider = { recipient: "Test Provider", contact: "https://example.test/privacy", items: "기기 토큰", timingAndMethod: "등록·발송 시 TLS", purpose: "문의 답변 알림", retention: "검증된 처리 기간", refusal: "알림 해제, 앱 내 확인 유지", countries: ["US"], legalBasis: "contract_necessary", contractReference: "CONTRACT-123", noticeReference: "NOTICE-123", nativeVerificationReference: "NATIVE-123" };
test("시행 준비 점검은 미확인 사항을 승인하지 않고 실제 근거 번호를 요구한다", () => {
  const evidence = parseLegalReadinessEvidence(pending);
  const blockers = legalReadinessBlockers(evidence, legalRuntimeFacts({}));
  assert.ok(blockers.includes("finalDocumentApproval"));
  assert.ok(blockers.includes("backupRetentionAndRestoreTest"));
  assert.ok(blockers.includes("privacyReplayLedgerDisabled"));
  assert.throws(() => parseLegalReadinessEvidence({ ...pending, checks: { finalDocumentApproval: { confirmed: true } } }));
  assert.throws(() => parseLegalReadinessEvidence({ ...pending, backupRetentionDays: 0 }));
});
test("런타임 확인 결과는 비밀키·메일주소·저장소 주소를 포함하지 않는다", () => {
  const facts = legalRuntimeFacts({ FCM_PUSH_TEST_EMAILS: "private@example.test", DAUM_SMTP_APP_PASSWORD: "very-private-key", GOOGLE_APPLICATION_CREDENTIALS: "/secret/path", APNS_PUSH_ENABLED: "true", LOCATION_EXTERNAL_COORDINATE_MODE: "processor" });
  assert.equal(facts.androidPush, true);
  assert.equal(facts.iosPush, true);
  assert.equal(facts.externalCoordinates, "processor");
  assert.doesNotMatch(JSON.stringify(facts), /private@example|very-private|secret\/path/);
});
test("승인 문서 해시와 확인 근거가 모두 있어도 기능 설정이 다르면 시행 준비를 통과시키지 않는다", () => {
  const evidence = parseLegalReadinessEvidence({ ...pending, pushTransferReview: { providers: { fcm: provider, apns: provider } }, approvedDocumentHash: "a".repeat(64), rightsRecipient: { publicNoticeRequirementsReviewed: true, publicNoticeReviewReference: "REVIEW-123" }, checks: Object.fromEntries(LEGAL_MANUAL_CHECKS.map((key) => [key, { confirmed: true, reference: "VERIFIED-123" }])) });
  const facts = legalRuntimeFacts({ SERVICE_TERMS_WORKFLOW_ENABLED: "true", LEGAL_RIGHTS_WORKFLOW_ENABLED: "true", LEGAL_RIGHTS_ALERT_WEBHOOK_URL: "https://example.test/hook", PRIVACY_REPLAY_LEDGER_ENABLED: "true" });
  assert.deepEqual(legalReadinessBlockers(evidence, facts), []);
  assert.ok(legalReadinessBlockers(evidence, { ...facts, userAiProfiling: true }).includes("userAiProfilingConflictsWithDraft"));
  assert.ok(legalReadinessBlockers(evidence, { ...facts, externalCoordinates: "third_party" }).includes("unsupportedThirdPartyLocationMode"));
});

test("서버 발송을 꺼도 네이티브 푸시 국외 처리 확인을 생략하지 않는다", () => {
  const evidence = parseLegalReadinessEvidence(pending);
  const blockers = legalReadinessBlockers(evidence, legalRuntimeFacts({}));
  assert.ok(blockers.includes("pushTransfer.fcm.countries"));
  assert.ok(blockers.includes("pushTransfer.apns.legalBasis"));
});
