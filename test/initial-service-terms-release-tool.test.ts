import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/test";
(globalThis as { prisma?: unknown }).prisma = {};
const { initialReleaseCandidate, parseInitialReleaseArguments } = await import("../scripts/initial-service-terms-release");
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
