import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/test";
const now = new Date("2026-10-19T00:00:00Z");
const document = { title: "이용약관", summary: "서비스 이용 안내", importantTerms: ["중요 내용"], sections: [{ title: "범위", paragraphs: ["기록 보관"] }] };
let release: { version: string; document: typeof document; documentHash: string } | null = null;
let rightsUnavailable = false;
let lastRun: { category: string; action: string; createdAt: Date } | null = null;
let writes = 0;
let readOnlyTransactions = 0;
const db = {
  $executeRaw: async (parts: TemplateStringsArray) => { assert.equal(parts.join(""), "SET TRANSACTION READ ONLY"); readOnlyTransactions++; },
  serviceTermsRelease: { findFirst: async ({ where }: { where: { effectiveAt: { lte?: Date } } }) => where.effectiveAt.lte ? release : null },
  user: { count: async () => 10 },
  serviceTermsAcceptance: { count: async (input: unknown) => {
    assert.deepEqual(input, { where: { termsVersion: "current", documentHash: release?.documentHash, ageConfirmed: true, importantTermsConfirmed: true } });
    return 3;
  } },
  journalRightsCase: { count: async ({ where }: { where: { nextReviewAt?: unknown } }) => { if (rightsUnavailable) throw new Error("secret-db-url token private@example.test"); return where.nextReviewAt ? 1 : 2; } },
  journalRightsNotice: { count: async () => 4 },
  contentReport: { count: async () => 5 },
  systemLog: {
    findUnique: async () => lastRun,
    upsert: async ({ create, update, where }: { create: Record<string, unknown>; update: Record<string, unknown>; where: { id: string } }) => {
      assert.equal(where.id, "legal-rights-maintenance-latest");
      assert.doesNotMatch(JSON.stringify({ create, update }), /userId|email|caseId|token/);
      writes++;
      lastRun = update as typeof lastRun;
    },
  },
};
(globalThis as { prisma?: unknown }).prisma = { ...db, $transaction: async (operation: (client: typeof db) => Promise<unknown>, options: unknown) => { assert.deepEqual(options, { isolationLevel: "RepeatableRead" }); return operation(db); } };
const { inspectLegalOperations, recordRightsMaintenanceSuccess, assertLegalOperationsObserved } = await import("../src/server/legal/operations");
const { hashServiceTerms } = await import("../src/server/legal/serviceTerms");
const enabled = { SERVICE_TERMS_WORKFLOW_ENABLED: "true", SERVICE_TERMS_ENFORCEMENT_ENABLED: "true", LEGAL_RIGHTS_WORKFLOW_ENABLED: "true" };

test("운영 점검은 비활성 상태에서도 잔존 사건을 읽으며 미구현·미이행을 완료로 표시하지 않는다", async () => {
  const result = await inspectLegalOperations(now, {});
  assert.equal(result.terms.data?.stage, "disabled");
  assert.equal(result.terms.data?.currentReleasePresent, false);
  assert.equal(result.rights.data?.activeCases, 2);
  assert.equal(result.rights.data?.pendingNotices, 4);
  assert.equal(result.rights.data?.schedulerInstallationVerified, false);
  assert.equal(result.rights.data?.formalNoticeDeliveryVerified, false);
  assert.equal(result.operationalCompletionVerified, false);
  assert.throws(() => assertLegalOperationsObserved(result), /최근 적용 실행/);
  assert.equal(readOnlyTransactions, 2);
  assert.equal(writes, 0);
});

test("일반약관은 적용 원문·동의 영수증을 대조하고 전환 단계·미동의 계정 수를 구분한다", async () => {
  release = { version: "current", document, documentHash: hashServiceTerms(document) };
  let result = await inspectLegalOperations(now, enabled);
  assert.equal(result.terms.data?.stage, "enforcing");
  assert.equal(result.terms.data?.currentAcceptances, 3);
  assert.equal(result.terms.data?.accountsWithoutCurrentAcceptance, 7);
  assert.equal(result.terms.data?.clientRolloutVerified, false);
  result = await inspectLegalOperations(now, { ...enabled, SERVICE_TERMS_ENFORCEMENT_ENABLED: "false" });
  assert.equal(result.terms.data?.stage, "effective_not_enforced");
  release.documentHash = "a".repeat(64);
  assert.equal((await inspectLegalOperations(now, enabled)).terms.data?.documentIntegrity, false);
});

test("테이블·연결 실패는 0건으로 숨기지 않고 오류 원문·비밀정보도 출력하지 않는다", async () => {
  rightsUnavailable = true;
  const result = await inspectLegalOperations(now, enabled);
  assert.equal(result.terms.status, "observed");
  assert.deepEqual(result.rights, { status: "unavailable", data: null });
  assert.doesNotMatch(JSON.stringify(result), /secret-db-url|private@example|token/);
  rightsUnavailable = false;
});

test("실행 관측은 예약 설치·법정 전달의 증명이 아니며 미래 시각은 최근 실행으로 인정하지 않는다", async () => {
  release!.documentHash = hashServiceTerms(document);
  await recordRightsMaintenanceSuccess(now);
  assert.equal(writes, 1);
  let result = await inspectLegalOperations(now, enabled);
  assert.equal(result.rights.data?.recentSuccessfulApplyObserved, true);
  assert.equal(result.rights.data?.schedulerInstallationVerified, false);
  assert.equal(result.rights.data?.formalNoticeDeliveryVerified, false);
  assert.doesNotThrow(() => assertLegalOperationsObserved(result));
  result = await inspectLegalOperations(new Date(now.getTime() + 6 * 60_000), enabled);
  assert.equal(result.rights.data?.recentSuccessfulApplyObserved, false);
  assert.throws(() => assertLegalOperationsObserved(result), /최근 적용 실행/);
  result = await inspectLegalOperations(new Date(now.getTime() - 1), enabled);
  assert.equal(result.rights.data?.recentSuccessfulApplyObserved, false);
});

test("운영 조회 래퍼는 임의 인자·빌드·적용 실행을 허용하지 않는다", () => {
  const file = "scripts/ops/tuti-legal-operations-inspect";
  assert.equal(spawnSync("sh", ["-n", file]).status, 0);
  assert.notEqual(spawnSync("sh", [file, "--apply"]).status, 0);
  const source = readFileSync(file, "utf8");
  assert.match(source, /--env-file \.env\.production/);
  assert.doesNotMatch(source, /docker.*build|migrate deploy|\"\$@\"/);
});
