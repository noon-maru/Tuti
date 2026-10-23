import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/test";
process.env.PRIVACY_REPLAY_LEDGER_ENABLED = "false";
const cutoff = new Date("2026-10-22T07:51:55.612Z");
const base = () => ({ id: "subject", role: "user", createdAt: new Date("2026-09-01"), authIdentities: [] as { email: string; provider: string; providerRefreshTokenEncrypted: null }[], journalEntries: [] as unknown[], journalBooks: [] as unknown[] });
let initial = base();
let locked = { role: "user", createdAt: new Date("2026-09-01"), _count: { journalEntries: 0, journalBooks: 0 } };
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
const { deleteEmptyOrdinaryAccount } = await import("../src/server/admin/users");

test("관리자·신규 계정·기록/기록집 보유 계정은 최초 검사에서 제외한다", async () => {
  for (const update of [{ role: "admin" }, { createdAt: new Date("2026-10-23") }, { journalEntries: [{}] }, { journalBooks: [{}] }]) {
    initial = { ...base(), ...update };
    calls.length = 0;
    assert.equal(await deleteEmptyOrdinaryAccount("subject", cutoff), null);
    assert.deepEqual(calls, []);
  }
});

test("준비 후 기록·기록집 생성 또는 승격이 생겨도 행 잠금 후 재검사하여 삭제하지 않는다", async () => {
  initial = base();
  for (const value of [
    { role: "admin", createdAt: new Date("2026-09-01"), _count: { journalEntries: 0, journalBooks: 0 } },
    { role: "user", createdAt: new Date("2026-09-01"), _count: { journalEntries: 1, journalBooks: 0 } },
    { role: "user", createdAt: new Date("2026-09-01"), _count: { journalEntries: 0, journalBooks: 1 } },
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
  locked = { role: "user", createdAt: new Date("2026-09-01"), _count: { journalEntries: 0, journalBooks: 0 } };
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
  for (const text of ["if (!apply) return", "candidates.length !== expected", 'options.get("--plan-hash") !== planHash', "readPrivacyReplaySnapshot()).unresolved", "for (const candidate of candidates)", 'role: "user"', "journalEntries: { none: {} }", "journalBooks: { none: {} }"]) assert.ok(source.includes(text), text);
});
