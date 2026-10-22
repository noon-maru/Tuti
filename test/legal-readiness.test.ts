import assert from "node:assert/strict";
import test from "node:test";
import { LEGAL_MANUAL_CHECKS, legalRuntimeFacts, legalReadinessBlockers, legalReadinessReport, parseLegalReadinessArguments, parseLegalReadinessEvidence, parseLegalReadinessScope } from "@/server/legal/readiness";

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

const termsEvidence = () => parseLegalReadinessEvidence({ ...pending,
  approvedDocumentHash: "a".repeat(64),
  rightsRecipient: { publicNoticeRequirementsReviewed: true, publicNoticeReviewReference: "REVIEW-123" },
  checks: Object.fromEntries(LEGAL_MANUAL_CHECKS.map((key) => [key, { confirmed: true, reference: "VERIFIED-123" }])),
});
const termsFacts = () => legalRuntimeFacts({ SERVICE_TERMS_WORKFLOW_ENABLED: "true", LEGAL_RIGHTS_WORKFLOW_ENABLED: "true", LEGAL_RIGHTS_ALERT_WEBHOOK_URL: "https://example.test/hook", PRIVACY_REPLAY_LEDGER_ENABLED: "true" });

test("일반약관 범위는 미확정 푸시를 자동 승인하지 않고 별도로 표시한다", () => {
  const evidence = termsEvidence();
  const report = legalReadinessReport(evidence, termsFacts(), "service-terms");
  assert.equal(report.ready, true);
  assert.equal(report.allReady, false);
  assert.equal(report.scopes.push.ready, false);
  assert.ok(report.unresolvedOutsideScope.includes("pushTransfer.fcm.countries"));
  assert.deepEqual(report.blockers, []);
  assert.equal(report.operationalCompletionVerified, false);
  assert.ok(legalReadinessBlockers(evidence, termsFacts()).includes("pushTransfer.apns.legalBasis"));
  assert.deepEqual(legalReadinessBlockers(evidence, termsFacts(), "service-terms"), []);
});

test("일반약관의 문서 승인·운영·권리 보호 검사는 분리 후에도 생략하지 않는다", () => {
  const pendingEvidence = parseLegalReadinessEvidence(pending);
  const blockers = legalReadinessBlockers(pendingEvidence, legalRuntimeFacts({}), "service-terms");
  for (const key of ["approvedDocumentHashMissing", "finalDocumentApproval", "backupRetentionAndRestoreTest", "rightsWorkflowDisabled", "privacyReplayLedgerDisabled", "noticePlan"]) assert.ok(blockers.includes(key));
  assert.ok(blockers.every((blocker) => !blocker.startsWith("pushTransfer.")));
});

test("푸시 범위는 일반약관 준비나 서버 발송 해제로 확인 항목을 우회하지 않는다", () => {
  const evidence = termsEvidence();
  const off = legalRuntimeFacts({ FCM_PUSH_ENABLED: "false", APNS_PUSH_ENABLED: "false" });
  const push = legalReadinessBlockers(evidence, off, "push");
  assert.ok(push.includes("pushTransfer.fcm.nativeVerificationReference"));
  assert.ok(push.includes("pushTransfer.apns.countries"));
  assert.deepEqual(push, legalReadinessBlockers(evidence, termsFacts(), "push"));
  evidence.pushTransfers = { fcm: provider, apns: provider };
  const report = legalReadinessReport(evidence, off, "push");
  assert.equal(report.ready, true);
  assert.equal(report.allReady, false);
  assert.ok(report.unresolvedOutsideScope.includes("serviceTermsWorkflowDisabled"));
});

test("점검 범위는 기본 전체이며 오타·중복 옵션으로 범위를 조용히 축소하지 않는다", () => {
  assert.deepEqual(parseLegalReadinessArguments([]), { file: "docs/legal/readiness-status.json", scope: "all", strict: false });
  assert.deepEqual(parseLegalReadinessArguments(["--scope=service-terms", "--strict", "--file=evidence.json"]), { file: "evidence.json", scope: "service-terms", strict: true });
  assert.equal(parseLegalReadinessScope("push"), "push");
  assert.equal(parseLegalReadinessScope("notice"), "notice");
  for (const args of [["--scope=terms"], ["--scope="], ["--scope=push", "--scope=all"], ["--strict", "--strict"], ["--file="], ["--ignore-push"]]) assert.throws(() => parseLegalReadinessArguments(args));
  assert.throws(() => parseLegalReadinessScope(null));
});

test("공고 전용 점검은 문서 승인을 유지하되 앱 출시·계정 정리·강제 기능 활성화를 요구하지 않는다", () => {
  const evidence = termsEvidence();
  evidence.checks.nativeClientRollout = { confirmed: false, reference: null };
  evidence.checks.scheduledJobsAndAlerts = { confirmed: false, reference: null };
  evidence.checks.backupRetentionAndRestoreTest = { confirmed: false, reference: null };
  const report = legalReadinessReport(evidence, legalRuntimeFacts({}), "notice");
  assert.equal(report.ready, true);
  assert.equal(report.scopes["service-terms"].ready, false);
  assert.ok(report.unresolvedOutsideScope.includes("nativeClientRollout"));
  assert.ok(report.unresolvedOutsideScope.includes("serviceTermsWorkflowDisabled"));
  evidence.checks.finalDocumentApproval = { confirmed: false, reference: null };
  assert.ok(legalReadinessBlockers(evidence, legalRuntimeFacts({}), "notice").includes("finalDocumentApproval"));
});
