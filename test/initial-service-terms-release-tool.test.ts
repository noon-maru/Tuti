import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/test";
(globalThis as { prisma?: unknown }).prisma = {};
const { initialReleaseCandidate, parseInitialReleaseArguments, initialNotices, isInitialNoticeApproval, preexistingOrdinaryAccountFilter } = await import("../scripts/initial-service-terms-release");
const evidence = JSON.parse(readFileSync("docs/legal/readiness-status.json", "utf8"));

test("최초 등록 도구는 조회와 명시적 최초 계약 승인을 구분한다", () => {
  assert.equal(parseInitialReleaseArguments(["--check"]), false);
  assert.equal(parseInitialReleaseArguments(["--apply", "--approve-initial-contract"]), true);
  for (const args of [[], ["--apply"], ["--approve-initial-contract"], ["--check", "--apply"], ["--apply", "--approve-initial-contract", "--apply"]]) {
    assert.throws(() => parseInitialReleaseArguments(args));
  }
});

test("후보는 승인 원문과 동일하며 실행 시각을 사용하고 과거 날짜로 시행하지 않는다", () => {
  const now = new Date("2026-10-23T03:00:00Z");
  const release = initialReleaseCandidate(evidence, now);
  assert.equal(release.publicationMode, "initial");
  assert.equal(release.documentHash, evidence.approvedDocumentHash);
  assert.equal(release.effectiveAt, now);
  assert.equal(release.publishedAt, now);
  assert.equal(release.noticeDays, 0);
  assert.equal(release.initialContractReference, "INITIAL-TEST-CLOSURE-20261023");
  assert.throws(() => initialReleaseCandidate({ ...evidence, approvedDocumentHash: "a".repeat(64) }, now));
  const changed = structuredClone(evidence);
  changed.checks.finalDocumentApproval.confirmed = false;
  assert.throws(() => initialReleaseCandidate(changed, now));
});

test("네 문서의 최초 공고는 별도 승인이 필요하며 승인 원문과 실제 공고 시각을 유지한다", () => {
  assert.equal(isInitialNoticeApproval(["--announce"]), false);
  assert.equal(isInitialNoticeApproval(["--announce", "--approve-initial-contract"]), true);
  assert.equal(isInitialNoticeApproval(["--announce", "--approve-initial-contract", "--apply"]), false);
  const now = new Date("2026-10-23T05:20:00Z");
  const notices = initialNotices(evidence, now);
  assert.equal(notices.length, 4);
  assert.equal(new Set(notices.map(n => n.documentType)).size, 4);
  for (const notice of notices) {
    assert.equal(notice.publicationMode, "initial");
    assert.equal(notice.publishedAt, now);
    assert.equal(notice.plannedEffectiveAt.toISOString(), now.toISOString());
    assert.equal(notice.version, "2026-10-22");
  }
  assert.equal(notices.find(n => n.documentType === "service-terms")!.documentHash, evidence.approvedDocumentHash);
});

test("공고는 최초 적용 이전 계정을 차단하되 이후 신규 계정을 삭제하거나 차단 조건에 포함하지 않는다", () => {
  const effectiveAt = new Date("2026-10-23T05:11:40.612Z");
  const where = preexistingOrdinaryAccountFilter(effectiveAt);
  assert.deepEqual(where, { role: { not: "admin" }, createdAt: { lte: effectiveAt } });
  const rows = [
    { role: "user", createdAt: new Date(effectiveAt.getTime() - 1) },
    { role: "user", createdAt: new Date(effectiveAt.getTime()) },
    { role: "user", createdAt: new Date(effectiveAt.getTime() + 1) },
    { role: "admin", createdAt: new Date(effectiveAt.getTime() - 1) },
  ];
  assert.deepEqual(rows.map(row => row.role !== where.role.not && row.createdAt <= where.createdAt.lte), [true, true, false, false]);
  assert.throws(() => preexistingOrdinaryAccountFilter(new Date("invalid")));
  const source = readFileSync("scripts/initial-service-terms-release.ts", "utf8");
  assert.match(source, /tx\.user\.count\(\{ where: preexistingOrdinaryAccountFilter\(current\.effectiveAt\) \}\)/);
  // 최초 릴리스 자체의 0계정 검사와 DB 트리거는 그대로 유지한다.
  assert.match(source, /if \(await tx\.user\.count\(\{ where: \{ role: \{ not: "admin" \} \} \}\)/);
  assert.match(readFileSync("prisma/migrations/20261022120000_add_initial_service_terms_release/migration.sql", "utf8"), /Initial terms require closure of existing ordinary accounts/);
});

test("래퍼는 검토된 코드·승인 기록만 읽기 전용 전달하고 강제 설정이나 앱을 변경하지 않는다", () => {
  const file = "scripts/ops/tuti-initial-terms-release";
  assert.equal(spawnSync("sh", ["-n", file]).status, 0);
  const source = readFileSync(file, "utf8");
  assert.match(source, /diff --quiet HEAD/);
  assert.match(source, /hash-object --no-filters/);
  assert.match(source, /flock --exclusive/);
  assert.match(source, /readiness\.json:ro/);
  assert.match(source, /initial-service-terms-release\.ts:ro/);
  assert.doesNotMatch(source, /--privileged|docker.*build|migrate deploy|restart|up -d/);
  const script = readFileSync("scripts/initial-service-terms-release.ts", "utf8");
  assert.match(script, /SET TRANSACTION READ ONLY/);
  assert.match(script, /assertServiceTermsOperationalReadiness/);
  assert.match(script, /service_terms_releases_initial_guard/);
  assert.match(script, /LOCK TABLE users IN SHARE MODE/);
  assert.match(script, /tx\.legalDocumentNotice\.count\(\)/);
  assert.match(script, /serviceTermsEnforcementEnabled\(\)/);
  assert.doesNotMatch(script, /serviceTermsAcceptance\.create|deleteMany|process\.env\.[A-Z_]+\s*=/);
});
