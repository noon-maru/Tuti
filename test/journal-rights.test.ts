import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { planRightsTransition, rightsBlockActive, validRightsReference, type RightsCaseState } from "@/shared/legal/journalRights";

const now = new Date("2026-10-19T00:00:00Z");
const DAY = 86400000;
const at = (days: number) => new Date(now.getTime() + days * DAY);
const fresh = (kind = "privacy"): RightsCaseState => ({ kind, state: "received", receivedAt: now, blockedAt: null, expiresAt: null, counterRequestedAt: null, resumeAt: null, litigationNotifiedAt: null });
const proof = { proofReference: "CASE-proof-01" };

test("임시조치는 30일까지만 허용하고 만료 순간부터 공개 차단 효력이 끝난다", () => {
  const original = fresh();
  for (const days of [0, 31, 1.5, "invalid"]) assert.throws(() => planRightsTransition(original, "temporary_block", { ...proof, days }, now));
  const blocked = { ...original, ...planRightsTransition(original, "temporary_block", proof, now) };
  assert.equal(rightsBlockActive(blocked, false, at(29)), true);
  assert.equal(rightsBlockActive(blocked, false, at(30)), false);
  assert.throws(() => planRightsTransition(blocked, "temporary_block", proof, at(29)), { status: 409 });
  assert.throws(() => planRightsTransition(fresh("copyright"), "temporary_block", proof, now));
});
test("저작권 재개는 실제 요청일의 7~14일 범위·권리 소명 확인을 요구한다", () => {
  const original = fresh("copyright");
  const blocked = { ...original, ...planRightsTransition(original, "copyright_suspend", proof, now) };
  assert.equal(rightsBlockActive(blocked, false, at(50)), true);
  assert.throws(() => planRightsTransition(blocked, "record_counter", { ...proof, receivedAt: at(-1).toISOString() }, now));
  assert.throws(() => planRightsTransition(blocked, "record_counter", { ...proof, receivedAt: at(1).toISOString() }, now));
  const counter = { ...blocked, ...planRightsTransition(blocked, "record_counter", { ...proof, receivedAt: now.toISOString() }, now) };
  for (const days of [6, 15]) assert.throws(() => planRightsTransition(counter, "schedule_resume", { ...proof, rightsVerified: true, resumeAt: at(days).toISOString() }, now));
  assert.throws(() => planRightsTransition(counter, "schedule_resume", { ...proof, resumeAt: at(7).toISOString() }, now));
  const scheduled = { ...counter, ...planRightsTransition(counter, "schedule_resume", { ...proof, rightsVerified: true, resumeAt: at(7).toISOString() }, now) };
  assert.equal(rightsBlockActive(scheduled, true, at(6)), true);
  assert.equal(rightsBlockActive(scheduled, false, at(7)), true);
  assert.equal(rightsBlockActive(scheduled, true, at(7)), false);
  assert.throws(() => planRightsTransition(counter, "schedule_resume", { ...proof, rightsVerified: true, resumeAt: at(7).toISOString() }, at(8)));
  const lawsuit = { ...scheduled, ...planRightsTransition(scheduled, "record_lawsuit", { ...proof, receivedAt: at(6).toISOString() }, at(6)) };
  assert.equal(rightsBlockActive(lawsuit, true, at(50)), true);
  assert.throws(() => planRightsTransition(scheduled, "record_lawsuit", { ...proof, receivedAt: at(7).toISOString() }, at(7)));
});
test("모든 판단에 외부 근거 번호가 필요하고 개인정보 원문은 번호로 허용하지 않는다", () => {
  assert.equal(validRightsReference("test@example.com"), false);
  assert.equal(validRightsReference("민감한 사유"), false);
  assert.throws(() => planRightsTransition(fresh(), "temporary_block", {}, now));
  assert.equal(planRightsTransition(fresh(), "close_release", proof, now).state, "closed");
  assert.throws(() => planRightsTransition({ ...fresh(), state: "closed" }, "close_release", proof, now), { status: 409 });
});

process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/test";
let records: Array<ReturnType<typeof sample>> = [];
let writes = 0;
let queries = 0;
let alertUpdates = 0;
let lastFindWhere: unknown;
function sample() {
  return { ...fresh(), id: "case-1", reportId: "report-1", reference: "CASE-1", proofReference: "proof-1", revision: 0, nextReviewAt: now,
    report: { entryId: "entry-1", reporterUserId: "reporter", targetOwnerId: "author" },
    notices: [] as Array<{ kind: string; recipientRole: string; status: string }>,
  };
}
const db = {
  $queryRaw: async (sql: TemplateStringsArray) => {
    const statement = sql.join("?");
    if (statement.includes("pg_advisory_xact_lock")) {
      assert.match(statement, /pg_advisory_xact_lock\(hashtext\('tuti-journal-rights-deadline-alert'\)\)::text AS lock_result/);
    }
    return [];
  },
  journalRightsCase: {
    findMany: async ({ where }: { where: unknown }) => { lastFindWhere = where; queries++; return records; },
    findUnique: async () => records[0] ?? null,
    update: async ({ data }: { data: Record<string, unknown> }) => { if (data.state) assert.equal(data.lastRemindedAt, null); writes++; return { ...records[0], ...data, revision: records[0].revision + 1 }; },
    updateMany: async () => { alertUpdates++; },
  },
  journalRightsNotice: { createMany: async () => { writes++; } },
  contentReport: { update: async () => { writes++; } },
  systemLog: { create: async () => { writes++; } },
  // Intentionally no journalEntry writer: automated expiry must not republish a private record.
};
(globalThis as { prisma?: unknown }).prisma = { ...db, $transaction: (operation: (client: typeof db) => Promise<unknown>) => operation(db) };
const service = await import("@/server/legal/journalRights");
test("권리 보호 서비스: 비활성·복수 사건·재시도 경계", async (t) => {
  await t.test("기능 비활성 시 새 테이블을 조회하지 않는다", async () => {
    delete process.env.LEGAL_RIGHTS_WORKFLOW_ENABLED;
    assert.equal(await service.isJournalLegallyBlocked("entry-1"), false);
    assert.equal((await service.listRightsCases()).enabled, false);
    assert.equal(queries, 0);
    await assert.rejects(service.maintainRightsCases(), { status: 409 });
  });
  process.env.LEGAL_RIGHTS_WORKFLOW_ENABLED = "true";
  await t.test("만료 사건 외에 다른 중단 사건이 있으면 차단을 유지한다", async () => {
    const expired = { ...sample(), state: "temporary_block", blockedAt: at(-30), expiresAt: now };
    records = [expired];
    assert.equal(await service.isJournalLegallyBlocked("entry-1", now), false);
    records.push({ ...sample(), kind: "copyright", state: "copyright_block" });
    assert.equal(await service.isJournalLegallyBlocked("entry-1", now), true);
  });
  await t.test("기본 점검은 쓰지 않고 실제 만료 처리는 공개 상태를 변경하지 않는다", async () => {
    records = [{ ...sample(), state: "temporary_block", blockedAt: at(-30), expiresAt: now }];
    assert.equal((await service.maintainRightsCases(false, now)).expired, 1);
    assert.equal(writes, 0);
    assert.equal((await service.maintainRightsCases(true, now)).expired, 1);
    assert.equal(writes, 4);
  });
  await t.test("이전 리비전의 중복·경합 요청을 거절한다", async () => {
    records = [sample()];
    await assert.rejects(service.actOnRightsCase({ id: "case-1", revision: -1, action: "close_release", ...proof }, "admin", now), { status: 409 });
    assert.equal(writes, 4);
  });
  await t.test("서식 통지 미완료 사건을 자동 재개하지 않는다", async () => {
    records = [{ ...sample(), kind: "copyright", state: "resume_scheduled", counterRequestedAt: at(-7), resumeAt: now }];
    const result = await service.maintainRightsCases(true, now);
    assert.equal(result.resumed, 0);
    assert.equal(result.needsReview, 1);
    assert.equal(writes, 4);
  });
  await t.test("운영 알림 실패는 발송 완료로 표시하지 않고 성공한 경우에만 알림 시각을 갱신한다", async () => {
    process.env.LEGAL_RIGHTS_ALERT_WEBHOOK_URL = "https://alerts.example.test/hook";
    records = [sample()];
    let sent = "";
    const failing: typeof fetch = async (_input, init) => { sent = String(init?.body); return new Response(null, { status: 503 }); };
    await assert.rejects(service.sendRightsDeadlineAlert(now, failing));
    const pendingNotice = (lastFindWhere as { AND: Array<{ OR: unknown[] }> }).AND[1].OR[1];
    assert.deepEqual(pendingNotice, { notices: { some: { status: "manual_required", createdAt: { lte: now } } } }, "법정 서식 통지도 3일 지연 없이 즉시 확인 대상이어야 한다.");
    assert.equal(alertUpdates, 0);
    assert.doesNotMatch(sent, /case-1|reporter|author|proof-1|CASE-1/);
    const success: typeof fetch = async () => new Response(null, { status: 204 });
    assert.equal((await service.sendRightsDeadlineAlert(now, success)).alerted, 1);
    assert.equal(alertUpdates, 1);
    delete process.env.LEGAL_RIGHTS_ALERT_WEBHOOK_URL;
    assert.equal((await service.sendRightsDeadlineAlert(now, success)).enabled, false);
  });
  await t.test("새 조치의 통지는 이전 알림의 하루 중복 억제에 가려지지 않는다", async () => {
    records = [Object.assign(sample(), { lastRemindedAt: now })];
    await service.actOnRightsCase({ id: "case-1", revision: 0, action: "temporary_block", ...proof }, "admin", now);
  });
  delete process.env.LEGAL_RIGHTS_WORKFLOW_ENABLED;
});
test("권리 보호 정기 점검 래퍼의 셸 문법을 검증한다", () => {
  assert.equal(spawnSync("sh", ["-n", "scripts/ops/tuti-journal-rights-maintain"], { encoding: "utf8" }).status, 0);
});

test("약관 공고 잠금도 Prisma가 처리할 수 있는 반환 형식을 사용한다", () => {
  const source = readFileSync("scripts/publish-service-terms.ts", "utf8");
  assert.match(source, /pg_advisory_xact_lock\(20261019, 1\)::text AS lock_result/);
});
