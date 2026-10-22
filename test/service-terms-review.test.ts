import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { prepareServiceTermsReview } from "../src/server/legal/noticePreparation";
import { parseServiceTermsDocument } from "../src/shared/legal/serviceTerms";
import { legalReadinessReport, legalRuntimeFacts, parseLegalReadinessEvidence } from "../src/server/legal/readiness";

test("승인 검토 후보는 21개 조항·부칙을 보존하고 검토 메모만 분리한다", async () => {
  const source = await readFile("docs/legal/service-terms-draft.md", "utf8");
  const review = prepareServiceTermsReview(source);
  assert.equal(review.articleCount, 22);
  assert.equal(review.document.sections[0].title, "제1조 목적과 서비스의 성격");
  assert.equal(review.document.sections[21].title, "부칙");
  assert.equal(review.approved, false);
  assert.equal(review.published, false);
  assert.equal(review.noticeDays, 30);
  assert.equal(review.documentHash, createHash("sha256").update(JSON.stringify(parseServiceTermsDocument(review.document))).digest("hex"));
  assert.doesNotMatch(JSON.stringify(review.document), /검토 메모|초안|구현 전|공개 전 확정/);
  for (const text of ["법정 책임", "별도 선택 동의", "소급하지", "기록의 저작권", "이용자의 권리", "만 14세"]) assert.ok(JSON.stringify(review.document).includes(text), text);
});

test("새 미확정 메모·조항 누락·순서 변경을 조용히 지우거나 승인하지 않는다", async () => {
  const source = await readFile("docs/legal/service-terms-draft.md", "utf8");
  assert.throws(() => prepareServiceTermsReview(source.replace("## 제1조 목적과 서비스의 성격", "## 제2조 목적과 서비스의 성격")));
  assert.throws(() => prepareServiceTermsReview(source.replace("## 제21조 사업자 정보", "사업자 정보")));
  assert.throws(() => prepareServiceTermsReview(source.replace("이 약관은 눈마루", "[공개 전 확정] 이 약관은 눈마루")), /draft/);
  assert.throws(() => prepareServiceTermsReview(source.replace("## 검토 메모 — 공고 원문 제외", "## 다른 메모")));
  const changed = prepareServiceTermsReview(source.replace("서비스의 성격", "서비스의 범위"));
  assert.notEqual(changed.documentHash, prepareServiceTermsReview(source).documentHash);
});

test("완료 근거 동기화는 최종 승인·공고·푸시 심사를 통과시킨 것으로 취급하지 않는다", async () => {
  const recorded = JSON.parse(await readFile("docs/legal/readiness-status.json", "utf8"));
  const review = prepareServiceTermsReview(await readFile("docs/legal/service-terms-draft.md", "utf8"));
  assert.equal(recorded.noticePreparation.candidateDocumentHash, review.documentHash);
  assert.equal(recorded.noticePreparation.noticeDays, 30);
  assert.equal(recorded.approvedDocumentHash, null);
  assert.equal(recorded.noticePreparation.approvalReference, null);
  assert.equal(recorded.noticePreparation.publicationApplied, false);
  const evidence = parseLegalReadinessEvidence(recorded);
  const report = legalReadinessReport(evidence, legalRuntimeFacts({}), "service-terms");
  assert.equal(report.ready, false);
  assert.ok(!report.blockers.includes("backupRetentionAndRestoreTest"));
  for (const blocker of ["finalDocumentApproval", "approvedDocumentHashMissing", "nativeClientRollout", "noticePlan", "rightsRecipientPublicNoticeUnconfirmed"]) assert.ok(report.blockers.includes(blocker), blocker);
  assert.equal(report.scopes.push.ready, false);
  const rejected = spawnSync(process.execPath, ["--import", "tsx", "scripts/prepare-service-terms-review.ts", "--apply"], { encoding: "utf8" });
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /승인·공고·파일 쓰기는 수행하지 않습니다/);
});

test("최초 약관 화면에 맞춘 문서는 계정 준비와 동의 완료·별도 동의·권리 행사를 구분한다", async () => {
  const review = prepareServiceTermsReview(await readFile("docs/legal/service-terms-draft.md", "utf8"));
  const admission = review.document.sections[2].paragraphs.join("\n");
  for (const text of ["앱을 처음 실행하거나 웹서비스에 처음 접속", "만 14세 이상 확인", "서버에 동의 기록이 저장되었음을 확인한 뒤", "계정 준비만으로 동의가 완료된 것으로 보지 않는다", "계정 복구·관리", "실제 나이를 검증한 것으로 표시하지 않는다"]) assert.ok(admission.includes(text), text);
  const privacy = await readFile("docs/legal/privacy-policy-draft.md", "utf8");
  for (const text of ["### 최초 접속과 일반 서비스 시작", "동의 전 모든 개인정보 처리가 없다는 뜻으로", "일괄 동의로 사용하지 않는다", "이 표시는 동의 영수증이 아니며", "일반 이용약관 동의 기록"]) assert.ok(privacy.includes(text), text);
  const location = await readFile("docs/legal/location-terms-draft.md", "utf8");
  assert.match(location, /일반 이용약관 동의와 만 14세 이상 확인만으로 위치 기능을/);
  const recorded = JSON.parse(await readFile("docs/legal/readiness-status.json", "utf8"));
  const flow = recorded.initialTermsFlow;
  assert.equal(flow.noCurrentTermsBlocksNewGeneralUse, true);
  assert.equal(flow.selfDeclaredAgeOnly, true);
  for (const key of ["draftAcceptanceAllowed", "deployed", "nativeDeviceVerified", "serverPreAccountAdmissionVerified", "finalApprovalApplied", "publicationApplied"]) assert.equal(flow[key], false);
  assert.equal(recorded.checks.minorProtection.confirmed, false);
  assert.equal(recorded.checks.nativeClientRollout.confirmed, false);
  assert.equal(recorded.approvedDocumentHash, null);
});
