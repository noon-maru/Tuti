import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { auditProcessingInventory, type ProcessingInventory } from "../src/server/legal/processingInventory";

async function fixture() {
  return { inventory: JSON.parse(await readFile("docs/legal/processing-inventory.json", "utf8")) as ProcessingInventory, schema: await readFile("prisma/schema.prisma", "utf8") };
}

test("모든 Prisma 모델을 한 번씩 분류하고 실제 소스 근거를 갖추되 법적 승인은 하지 않는다", async () => {
  const { inventory, schema } = await fixture();
  const report = auditProcessingInventory(inventory, schema);
  assert.equal(report.sourceCoverageComplete, true);
  assert.equal(report.publicationReady, false);
  assert.equal(report.legalApproval, false);
  assert.equal(report.liveDataInspected, false);
  assert.equal(report.models, [...schema.matchAll(/^model\s+/gm)].length);
  for (const source of report.sources) assert.ok((await readFile(source, "utf8")).length, source);
  const slack = inventory.externalFlows.find(flow => flow.id === "operations-slack")!;
  assert.match(slack.items, /사건 ID·신고자 연락처·기록 원문을 보내지 않음/);
  assert.ok(inventory.externalFlows.some(flow => flow.id === "cloudflare"));
  assert.ok(inventory.externalFlows.some(flow => flow.id === "social-login"));
});

test("새 모델·누락·중복·폐기된 모델은 분류 완료로 처리하지 않는다", async () => {
  const { inventory, schema } = await fixture();
  const added = auditProcessingInventory(inventory, `${schema}\nmodel NewPrivateData {\n id String @id\n}\n`);
  assert.equal(added.sourceCoverageComplete, false);
  assert.deepEqual(added.unclassifiedModels, ["NewPrivateData"]);
  inventory.groups[0].models.push("User", "RetiredModel");
  const duplicate = auditProcessingInventory(inventory, schema);
  assert.deepEqual(duplicate.duplicateModels, ["User"]);
  assert.deepEqual(duplicate.staleModels, ["RetiredModel"]);
  assert.equal(duplicate.sourceCoverageComplete, false);
});

test("무료 플랜·Tunnel 구성 확인을 계약·국가·기간·공고 승인과 분리한다", async () => {
  const { inventory, schema } = await fixture();
  assert.equal(auditProcessingInventory(inventory, schema).sourceCoverageComplete, true);
  const cloudflare = inventory.externalFlows.find(flow => flow.id === "cloudflare")!;
  assert.match(cloudflare.role, /무료 플랜·Cloudflare Tunnel/);
  assert.match(cloudflare.openReview, /캐시 규칙\/Workers\/로그 내보내기/);
  assert.ok(cloudflare.sources.some(source => source.includes("[entryId]")));
  const readiness = JSON.parse(await readFile("docs/legal/readiness-status.json", "utf8"));
  assert.equal(readiness.cloudflareReview.plan, "free");
  assert.equal(readiness.cloudflareReview.tunnelUsed, true);
  assert.equal(readiness.cloudflareReview.configurationEvidence, "operator_statement_not_dashboard_audit");
  assert.equal(readiness.cloudflareReview.defaultSettingsOperatorConfirmed, true);
  for (const key of ["cacheRulesReviewed", "workersRoutesReviewed", "logExportReviewed"]) assert.equal(readiness.cloudflareReview[key], true);
  for (const key of ["customCacheRulesConfigured", "customWorkersRoutesConfigured", "customLogExportConfigured", "accountContractVerified", "countriesVerified", "retentionVerified", "transferBasisApproved", "publicationApplied"]) assert.equal(readiness.cloudflareReview[key], false);
  assert.equal(readiness.checks.processorsAndTransfers.reference, "LEGAL-TEXT-DECISION-20261022");
  assert.match(readiness.approvedDocumentHash, /^[a-f0-9]{64}$/);
});

test("외부 안내 대조는 일곱 서비스의 송수신·삭제 경계를 정리하되 최종 승인으로 치환하지 않는다", async () => {
  const { inventory } = await fixture();
  const readiness = JSON.parse(await readFile("docs/legal/readiness-status.json", "utf8"));
  const review = readiness.externalNoticeReview;
  assert.deepEqual(review.servicesReviewed, ["daum-smtp", "cloudflare", "google-login", "apple-login", "kakao-login", "fcm", "apns"]);
  assert.equal(review.sourceReviewCompleted, true);
  assert.equal(review.daumOfficialServiceEntity, "주식회사 다음");
  assert.equal(review.googleKakaoProviderRevocationImplemented, false);
  assert.equal(review.appleProviderRevocationCodeReviewed, true);
  assert.equal(review.socialLoginDirectionsSeparated, true);
  assert.equal(review.pushServerAndNativeSeparated, true);
  for (const key of ["finalNoticeApproved", "publicationApplied", "runtimeFlagsChanged"]) assert.equal(review[key], false);
  assert.ok(review.remaining.length > 0);
  assert.equal(readiness.checks.processorsAndTransfers.noticeReviewReference, review.reference);
  assert.equal(readiness.checks.processorsAndTransfers.reference, "LEGAL-TEXT-DECISION-20261022");
  assert.match(readiness.approvedDocumentHash, /^[a-f0-9]{64}$/);
  const policy = await readFile("docs/legal/privacy-policy-draft.md", "utf8");
  for (const boundary of ["주식회사 다음", "회사 DB에 코드 검증값", "제공자 측의 앱 접근 권한까지 자동", "Self-Serve Subscription Agreement 제6.1항", "Kakao 앱의 국외 이전 정보 설정", "무효 토큰의 회사 DB 등록 삭제"]) assert.ok(policy.includes(boundary), boundary);
  assert.match(inventory.externalFlows.find(flow => flow.id === "social-login")!.items, /로컬 연결 삭제/);
  assert.match(inventory.externalFlows.find(flow => flow.id === "fcm-apns")!.items, /문의 ID\/본문/);
});

test("범위나 검토 과제를 지워 승인을 가장하거나 임의 파일을 읽도록 만들 수 없다", async () => {
  const { inventory, schema } = await fixture();
  assert.throws(() => auditProcessingInventory({ ...inventory, legalApproval: true } as unknown as ProcessingInventory, schema));
  assert.throws(() => auditProcessingInventory({ ...inventory, openReviews: [] }, schema));
  inventory.groups[0].sources = ["../private-file"];
  assert.throws(() => auditProcessingInventory(inventory, schema), /PATH_INVALID/);
  inventory.groups[0].sources = [".env.production"];
  assert.throws(() => auditProcessingInventory(inventory, schema), /PATH_INVALID/);
});

test("시행 대장은 소스 대조와 계약·처리 근거 승인을 분리하고 검사 도구는 적용 옵션을 받지 않는다", async () => {
  const { inventory, schema } = await fixture();
  const report = auditProcessingInventory(inventory, schema);
  const evidence = JSON.parse(await readFile("docs/legal/readiness-status.json", "utf8"));
  // Preserve the historical approved audit; disabled new functionality is not legal approval.
  assert.equal(evidence.checks.processingInventory.sourceAudit.prismaModelsClassified, report.models - report.pendingRolloutModels.length);
  assert.equal(evidence.checks.processingInventory.sourceAudit.groups, report.groups - report.pendingRolloutGroups);
  assert.deepEqual(report.pendingRolloutModels, ["HarumadiMember", "HarumadiInvite", "HarumadiComment", "LifecycleEvent"]);
  assert.equal(evidence.checks.processorsAndTransfers.sourceAudit.externalFlowGroups, report.externalFlows);
  assert.equal(evidence.checks.processingInventory.reference, "LEGAL-TEXT-DECISION-20261022");
  assert.equal(evidence.checks.processorsAndTransfers.reference, "LEGAL-TEXT-DECISION-20261022");
  assert.match(evidence.approvedDocumentHash, /^[a-f0-9]{64}$/);
  assert.equal(evidence.noticePreparation.publicationApplied, false);
  assert.equal(evidence.checks.nativeClientRollout.confirmed, true);
  assert.equal(evidence.checks.nativeClientRollout.reference, "NATIVE-RELEASE-ENTRY-OPERATOR-20261023");
  assert.equal(evidence.checks.nativeClientRollout.postCutoverConsentVerificationRequired, true);
  const rejected = spawnSync(process.execPath, ["--import", "tsx", "scripts/check-processing-inventory.ts", "--apply"], { encoding: "utf8" });
  assert.notEqual(rejected.status, 0);
  assert.doesNotMatch(rejected.stdout, /publicationReady.*true|legalApproval.*true/);
});
