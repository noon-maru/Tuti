import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { diagnosticLogData } from "../src/server/admin/diagnosticLog";
import { evidenceReviewDue, parseEvidenceHolds, retentionCutoffs, retentionPredicates, type EvidenceHold } from "../src/server/legal/retentionPolicy";

const now = new Date("2026-10-21T07:00:00.000Z");
const hold: EvidenceHold = {
  id: "hold-1", resource: "inquiry", targetId: "inquiry-1", caseReference: "CASE-1",
  purpose: "분쟁 대응", legalBasis: "건별 확인한 처리 근거", owner: "운영 담당자",
  terminationCondition: "사건과 필요한 권리 행사 종료", reviewedAt: "2026-07-23T07:00:00.000Z",
};
const encode = (holds: EvidenceHold[]) => JSON.stringify({ version: 1, holds });

test("3년·30일·1년 경계와 윤일을 보수적으로 계산한다", () => {
  const cutoffs = retentionCutoffs(now);
  assert.equal(cutoffs.inquiries.toISOString(), "2023-10-21T07:00:00.000Z");
  assert.equal(cutoffs.unfinishedShares.toISOString(), "2026-09-21T07:00:00.000Z");
  assert.equal(cutoffs.generalErrors.toISOString(), "2025-10-21T07:00:00.000Z");
  assert.equal(retentionCutoffs(new Date("2028-02-29T01:00:00Z")).generalErrors.toISOString(), "2027-02-28T01:00:00.000Z");
  assert.throws(() => retentionCutoffs(new Date("invalid")));
});

test("완료일 없는 문의·처리 중 문의·완료된 PNG·감사/보안 로그는 범주 밖이다", () => {
  const predicates = retentionPredicates(now, [hold]);
  assert.deepEqual(predicates.inquiries.status.in, ["answered", "closed"]);
  assert.deepEqual(predicates.inquiries.handledAt, { lte: retentionCutoffs(now).inquiries });
  assert.deepEqual(predicates.inquiries.updatedAt, predicates.inquiries.handledAt);
  assert.deepEqual(predicates.inquiries.id.notIn, ["inquiry-1"]);
  assert.equal(predicates.unfinishedShares.finalizedAt, null);
  assert.equal(predicates.generalErrors.category, "diagnostic");
  assert.equal(predicates.generalErrors.action, "diagnostic.error");
  assert.equal(predicates.generalErrors.level, "error");
});

test("보전 기한 90일은 자동 해제 기한이 아니고 손상·중복·미래 검토는 거부한다", () => {
  assert.deepEqual(parseEvidenceHolds(null, now), []);
  assert.equal(evidenceReviewDue(parseEvidenceHolds(encode([hold]), now)[0], now), true);
  assert.equal(evidenceReviewDue(hold, new Date(now.getTime() - 1)), false);
  for (const value of ["", "null", "{}", JSON.stringify({ version: 2, holds: [] }), encode([hold, hold]),
    encode([{ ...hold, reviewedAt: "2027-01-01T00:00:00.000Z" }]),
    JSON.stringify({ version: 1, holds: [{ ...hold, recordBody: "private" }] })]) {
    assert.throws(() => parseEvidenceHolds(value, now));
  }
});

test("전용 일반 오류는 유한 코드·최소 진단정보만 남기고 동적 원문을 받지 않는다", () => {
  const output = diagnosticLogData({ code: "UNEXPECTED_FAILURE", component: "journal", durationMs: 10,
    token: "SECRET", message: "private diary", actorUserId: "private-user" } as Parameters<typeof diagnosticLogData>[0]);
  assert.doesNotMatch(JSON.stringify(output), /SECRET|private diary|private-user/);
  assert.throws(() => diagnosticLogData({ code: "SECRET_TOKEN", component: "journal" } as unknown as Parameters<typeof diagnosticLogData>[0]));
  assert.throws(() => diagnosticLogData({ code: "RENDER_FAILED", component: "harumadiPdf", durationMs: NaN }));
});

const events: Array<{ operation: string; table?: string; where?: unknown }> = [];
let registry: string | null = null;
const delegate = (table: string) => ({
  count: async ({ where }: { where: unknown }) => { events.push({ operation: "count", table, where }); return 1; },
  deleteMany: async ({ where }: { where: unknown }) => { events.push({ operation: "delete", table, where }); return { count: 1 }; },
});
const tx = {
  customerInquiry: delegate("inquiry"), journalShareTrace: delegate("shareTrace"), systemLog: delegate("errorLog"),
  appSetting: {
    findUnique: async () => registry === null ? null : { value: registry },
    upsert: async ({ update }: { update: { value: string } }) => { registry = update.value; events.push({ operation: "upsert" }); },
  },
  $queryRaw: async (query: TemplateStringsArray) => { events.push({ operation: query.join("") }); return []; },
};
let savedLog: unknown;
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/test";
(globalThis as { prisma?: unknown }).prisma = {
  systemLog: { create: async ({ data }: { data: unknown }) => { savedLog = data; return data; } },
  $transaction: async (operation: (client: typeof tx) => unknown) => operation(tx),
};
const { purgeOperationalRetention, updateEvidenceHold } = await import("../src/server/legal/retention");
const { writeDiagnosticLogSafely, writeSystemLog } = await import("../src/server/admin/log");

test("기존 자유 입력 로그 경로로도 진단 원문·대상을 우회 저장할 수 없으며 수집 기본값은 비활성이다", async () => {
  const previous = process.env.PRIVACY_EXTENDED_RETENTION_ENABLED;
  try {
    delete process.env.PRIVACY_EXTENDED_RETENTION_ENABLED;
    savedLog = null;
    await writeDiagnosticLogSafely({ code: "UNEXPECTED_FAILURE", component: "harumadiPdf" });
    assert.equal(savedLog, null);
    process.env.PRIVACY_EXTENDED_RETENTION_ENABLED = "true";
    await writeDiagnosticLogSafely({ code: "UNEXPECTED_FAILURE", component: "harumadiPdf" });
    assert.match(JSON.stringify(savedLog), /UNEXPECTED_FAILURE/);
    await writeSystemLog({ category: "diagnostic", action: "bypass", level: "info", message: "PRIVATE_BODY",
      actorUserId: "PRIVATE_USER", targetId: "PRIVATE_RECORD", metadata: { code: "RENDER_FAILED", component: "harumadiPdf", secret: "SECRET" } });
    assert.doesNotMatch(JSON.stringify(savedLog), /PRIVATE_|SECRET|bypass/);
    assert.match(JSON.stringify(savedLog), /diagnostic.error/);
    await writeSystemLog({ category: "security", action: "security.example", message: "보안 감사", actorUserId: "operator" });
    assert.match(JSON.stringify(savedLog), /security.example/);
  } finally {
    if (previous === undefined) delete process.env.PRIVACY_EXTENDED_RETENTION_ENABLED;
    else process.env.PRIVACY_EXTENDED_RETENTION_ENABLED = previous;
  }
});

test("조회와 기존 --apply는 새 플래그 없이는 삭제하지 않는다", async () => {
  const previous = process.env.PRIVACY_EXTENDED_RETENTION_ENABLED;
  try {
    delete process.env.PRIVACY_EXTENDED_RETENTION_ENABLED;
    events.length = 0;
    registry = null;
    assert.equal((await purgeOperationalRetention(now)).mode, "dry-run");
    assert.equal((await purgeOperationalRetention(now, true)).mode, "disabled");
    assert.equal(events.filter(event => event.operation === "delete").length, 0);
    process.env.PRIVACY_EXTENDED_RETENTION_ENABLED = "true";
    registry = encode([hold]);
    events.length = 0;
    const applied = await purgeOperationalRetention(now, true);
    assert.equal(applied.mode, "applied");
    assert.equal(applied.reviewRequired, true);
    assert.equal(applied.dueEvidenceReviews, 1);
    assert.equal(events.filter(event => event.operation === "delete").length, 3);
    assert.match(events[0].operation, /pg_advisory_xact_lock\(/);
    assert.deepEqual((events.find(event => event.table === "inquiry")!.where as { id: unknown }).id, { notIn: ["inquiry-1"] });
    registry = "broken";
    events.length = 0;
    await assert.rejects(() => purgeOperationalRetention(now, true));
    assert.equal(events.filter(event => event.operation === "delete").length, 0);
  } finally {
    if (previous === undefined) delete process.env.PRIVACY_EXTENDED_RETENTION_ENABLED;
    else process.env.PRIVACY_EXTENDED_RETENTION_ENABLED = previous;
    registry = null;
  }
});

test("보전 등록·검토·해제도 기본 조회이며 정리와 동일한 잠금을 사용한다", async () => {
  registry = null;
  events.length = 0;
  const { reviewedAt: _reviewedAt, ...input } = hold;
  void _reviewedAt;
  await updateEvidenceHold({ operation: "register", hold: input }, now);
  assert.equal(registry, null);
  await updateEvidenceHold({ operation: "register", hold: input }, now, true);
  assert.equal(parseEvidenceHolds(registry, now)[0].reviewedAt, now.toISOString());
  await assert.rejects(() => updateEvidenceHold({ operation: "register", hold: input }, now, true));
  const next = new Date(now.getTime() + 90 * 86_400_000);
  await updateEvidenceHold({ operation: "review", id: hold.id }, next, true);
  assert.equal(evidenceReviewDue(parseEvidenceHolds(registry, next)[0], next), false);
  await updateEvidenceHold({ operation: "release", id: hold.id }, next);
  assert.equal(parseEvidenceHolds(registry, next).length, 1);
  await updateEvidenceHold({ operation: "release", id: hold.id }, next, true);
  assert.deepEqual(parseEvidenceHolds(registry, next), []);
  assert.ok(events.some(event => /pg_advisory_xact_lock\(/.test(event.operation)));
});

test("기존 유지보수·복원 잠금과 알림을 재사용하고 신규 정리는 별도 승인한다", () => {
  const script = readFileSync("scripts/maintain-privacy-data.ts", "utf8");
  assert.match(script, /purgeOperationalRetention/);
  assert.match(script, /reviewRequired/);
  const wrapper = readFileSync("scripts/ops/tuti-privacy-data-maintain", "utf8");
  assert.match(wrapper, /restore-privacy\/pending.env/);
});

test("소스 환경 예제의 신규 정리 플래그는 비활성 기본값이다", t => {
  const paths = [".env.example", ".env.production.example"];
  // .env.*를 이미지에 넣지 않는 패키징 정책은 유지한다. 런타임 기본 비활성은 위 모의 DB 시험에서 별도 검사한다.
  if (paths.every(path => !existsSync(path))) {
    assert.match(readFileSync(".dockerignore", "utf8"), /^\.env\.\*$/m);
    t.skip("환경 예제가 제외된 ops 이미지: 예제 기본값은 소스 체크아웃 CI에서 검증");
    return;
  }
  for (const path of paths) assert.match(readFileSync(path, "utf8"), /PRIVACY_EXTENDED_RETENTION_ENABLED=false/);
});

test("관리 도구의 오타·중복 적용 옵션은 거부하고 입력 식별값을 출력하지 않는다", () => {
  for (const [script, args] of [
    ["scripts/maintain-operational-retention.ts", ["--apply", "--apply"]],
    ["scripts/manage-retention-hold.ts", ["unknown", "PRIVATE_TARGET"]],
    ["scripts/manage-retention-hold.ts", ["release", "PRIVATE_TARGET", "--apply", "--apply"]],
  ] as const) {
    const result = spawnSync(process.execPath, ["--import", "tsx", script, ...args], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE_TARGET/);
    assert.doesNotMatch(result.stdout, /"mode":"applied"/);
  }
});

test("운영 대상 0건 조회와 예약 성공을 실제 파기·보전·공고 승인으로 바꾸지 않는다", () => {
  const readiness = JSON.parse(readFileSync("docs/legal/readiness-status.json", "utf8"));
  const observation = readiness.operationalRetentionVerification;
  assert.equal(observation.mode, "dry-run");
  assert.equal(observation.enabled, false);
  assert.deepEqual(observation.completedTasks, ["push", "sensitive", "operational-retention"]);
  assert.ok(Object.values(observation.counts).every(count => count === 0));
  assert.equal(observation.reviewRequired, false);
  assert.equal(observation.timerObservation.active, true);
  assert.equal(observation.timerObservation.enabled, true);
  assert.equal(observation.timerObservation.lastServiceResult, "success");
  for (const key of ["applyVerified", "holdMutationVerified", "reviewAlertDeliveryVerified", "productionDataChanged", "runtimeFlagsChanged"]) assert.equal(observation[key], false);
  assert.equal(readiness.checks.processingInventory.retentionVerificationReference, observation.reference);
  assert.equal(readiness.checks.processingInventory.reference, "LEGAL-TEXT-DECISION-20261022");
  assert.match(readiness.approvedDocumentHash, /^[a-f0-9]{64}$/);
  assert.equal(readiness.noticePreparation.publicationApplied, false);
  const isolated = observation.isolatedTest;
  assert.equal(isolated.actualPrisma, true);
  assert.equal(isolated.integrationTestsPassed, 19);
  assert.equal(isolated.temporaryResourcesRemoved, true);
  assert.equal(isolated.postgres17CiVerified, true);
  assert.equal(isolated.postgres17CiEvidence.integrationTestsPassed, 19);
  assert.match(isolated.postgres17CiEvidence.run, /actions\/runs\/39698243484$/);
  for (const key of ["realSlackDeliveryVerified", "productionSystemdFailureTested", "productionDataChanged", "runtimeFlagsChanged"]) assert.equal(isolated[key], false);
});
