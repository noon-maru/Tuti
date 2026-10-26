import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/test";
process.env.PRIVACY_REPLAY_LEDGER_ENABLED = "false";
const cutoff = new Date("2026-10-22T07:51:55.612Z");
const base = () => ({ id: "subject", role: "user", createdAt: new Date("2026-09-01"), authIdentities: [] as { email: string; provider: string; providerRefreshTokenEncrypted: null }[], journalEntries: [] as unknown[], harumadiPdfs: [] as unknown[] });
let initial = base();
let locked: { role: string; createdAt: Date; _count: { journalEntries: number; harumadiPdfs: number }; journalEntries?: unknown[]; harumadiPdfs?: unknown[]; authIdentities?: unknown[] } = { role: "user", createdAt: new Date("2026-09-01"), _count: { journalEntries: 0, harumadiPdfs: 0 } };
const calls: string[] = [];
const inputs = new Map<string, unknown>();
const transaction = new Proxy({}, { get(_target, table: string) {
  if (table === "$queryRaw") return async () => { calls.push("lock"); return [{ id: "subject" }]; };
  return new Proxy({}, { get(_delegate, method: string) { return async (input: unknown) => {
    calls.push(`${table}.${method}`);
    inputs.set(`${table}.${method}`, input);
    if (table === "user" && method === "findUnique") return locked;
    return { count: 1 };
  }; } });
} });
(globalThis as { prisma?: unknown }).prisma = {
  user: { findUnique: async () => initial },
  $transaction: async (operation: (client: unknown) => Promise<unknown>) => operation(transaction),
};
const { deleteEmptyOrdinaryAccount, deleteOrdinaryTestAccount } = await import("../src/server/admin/users");

test("관리자·신규 계정·기록/하루마디 보유 계정은 최초 검사에서 제외한다", async () => {
  for (const update of [{ role: "admin" }, { createdAt: new Date("2026-10-23") }, { journalEntries: [{}] }, { harumadiPdfs: [{}] }]) {
    initial = { ...base(), ...update };
    calls.length = 0;
    assert.equal(await deleteEmptyOrdinaryAccount("subject", cutoff), null);
    assert.deepEqual(calls, []);
  }
});

test("준비 후 기록·하루마디 생성 또는 승격이 생겨도 행 잠금 후 재검사하여 삭제하지 않는다", async () => {
  initial = base();
  for (const value of [
    { role: "admin", createdAt: new Date("2026-09-01"), _count: { journalEntries: 0, harumadiPdfs: 0 } },
    { role: "user", createdAt: new Date("2026-09-01"), _count: { journalEntries: 1, harumadiPdfs: 0 } },
    { role: "user", createdAt: new Date("2026-09-01"), _count: { journalEntries: 0, harumadiPdfs: 1 } },
  ]) {
    locked = value;
    calls.length = 0;
    assert.equal(await deleteEmptyOrdinaryAccount("subject", cutoff), null);
    assert.deepEqual(calls, ["lock", "user.findUnique"]);
  }
});

test("승인한 과거 빈 일반 계정은 기존 위치·인증·이력 삭제 경로를 사용한다", async () => {
  initial = base();
  initial.authIdentities.push({ email: "shared@example.invalid", provider: "email", providerRefreshTokenEncrypted: null });
  locked = { role: "user", createdAt: new Date("2026-09-01"), _count: { journalEntries: 0, harumadiPdfs: 0 } };
  calls.length = 0;
  const result = await deleteEmptyOrdinaryAccount("subject", cutoff);
  assert.equal(result?.deletedJournalCount, 0);
  assert.deepEqual(calls.slice(0, 2), ["lock", "user.findUnique"]);
  for (const call of ["locationUsageLog.deleteMany", "locationConsentEvent.deleteMany", "pushDelivery.deleteMany", "user.delete"]) assert.ok(calls.includes(call));
  assert.ok(!calls.some(call => call.startsWith("adminJournalAccessAudit.")));
  assert.ok(!calls.some(call => call.startsWith("emailVerificationCode.")));
  assert.deepEqual(inputs.get("customerInquiry.deleteMany"), { where: { OR: [{ requesterUserId: "subject" }, { handledByUserId: "subject" }] } });
  await assert.rejects(deleteEmptyOrdinaryAccount("subject", new Date("invalid")));
});

test("일괄 정리는 기본 조회이며 대상 수·해시·원장을 확인하고 순차 실행한다", () => {
  const source = readFileSync("scripts/cleanup-empty-accounts.ts", "utf8");
  for (const text of ["if (!apply) return", "candidates.length !== expected", 'options.get("--plan-hash") !== planHash', "readPrivacyReplaySnapshot()).unresolved", "for (const candidate of candidates)", 'role: "user"', "journalEntries: { none: {} }", "harumadiPdfs: { none: {} }"]) assert.ok(source.includes(text), text);
});

test("기록 포함 모드에서도 관리자·새 계정·스냅샷 변경은 삭제하지 않는다", async () => {
  initial = { ...base(), role: "admin" };
  calls.length = 0;
  assert.equal(await deleteOrdinaryTestAccount("subject", cutoff), null);
  assert.equal(calls.length, 0);
  initial = { ...base(), createdAt: new Date("2026-10-23") };
  assert.equal(await deleteOrdinaryTestAccount("subject", cutoff), null);
  initial = base();
  locked = { role: "admin", createdAt: new Date("2026-09-01"), _count: { journalEntries: 0, harumadiPdfs: 0 } };
  calls.length = 0;
  assert.equal(await deleteOrdinaryTestAccount("subject", cutoff), null);
  assert.deepEqual(calls, ["lock", "lock", "lock", "user.findUnique"]);
  locked = { ...locked, role: "user", journalEntries: [{ id: "new-record", image: null }], harumadiPdfs: [], authIdentities: [] };
  assert.equal(await deleteOrdinaryTestAccount("subject", cutoff), null);
  assert.ok(!calls.includes("user.delete"));
});

test("승인한 기록 보유 일반 계정은 사용자·기록·하루마디 잠금 이후에만 삭제한다", async () => {
  initial = base();
  initial.journalEntries.push({ id: "record", image: null });
  locked = { role: "user", createdAt: new Date("2026-09-01"), _count: { journalEntries: 1, harumadiPdfs: 0 }, journalEntries: initial.journalEntries, harumadiPdfs: [], authIdentities: [] };
  calls.length = 0;
  const result = await deleteOrdinaryTestAccount("subject", cutoff);
  assert.equal(result?.deletedJournalCount, 1);
  assert.deepEqual(calls.slice(0, 4), ["lock", "lock", "lock", "user.findUnique"]);
  assert.ok(calls.includes("user.delete"));
  assert.ok(!calls.some(call => call.startsWith("adminJournalAccessAudit.")));
});

test("기록 포함 모드는 명시적 옵션과 내용 스냅샷을 해시에 포함하며 기본 모드는 비운다", () => {
  const source = readFileSync("scripts/cleanup-empty-accounts.ts", "utf8");
  assert.ok(source.includes('args.includes("--include-records")'));
  assert.ok(source.includes("recordsIncluded: true, snapshots: candidates"));
  assert.ok(source.includes("includeRecords ? await deleteOrdinaryTestAccount"));
  assert.ok(source.includes("if (!apply) return"));
});
