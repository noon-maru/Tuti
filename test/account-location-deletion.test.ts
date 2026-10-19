import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/test";
const operations: string[] = [];
const query = async (table: string, method: string, input: unknown) => {
  operations.push(`${table}.${method}`);
  if (table === "locationUsageLog" || table === "locationConsentEvent") {
    assert.deepEqual(input, { where: { userId: "subject" } });
    assert.equal(method, "deleteMany");
  }
  if (table === "systemLog" && method === "deleteMany") {
    assert.deepEqual((input as { where: { NOT: unknown } }).where.NOT, { category: "journal", action: "journal.admin.viewed" });
  }
  assert.notEqual(table, "adminJournalAccessAudit", "계정 삭제가 분리 보존하는 접근 증거를 변경하면 안 된다.");
  return { count: 1 };
};
const transaction = new Proxy({}, {
  get(_target, table: string) {
    if (table === "$queryRaw") return async () => { operations.push("lock"); return [{ id: "subject" }]; };
    return new Proxy({}, { get(_delegate, method: string) { return (input: unknown) => query(table, method, input); } });
  },
});
(globalThis as { prisma?: unknown }).prisma = {
  user: { findUnique: async () => ({ id: "subject", role: "user", authIdentities: [], journalEntries: [], journalBooks: [] }) },
  $transaction: async (operation: (client: unknown) => Promise<unknown>) => operation(transaction),
};
const { deleteUserAccount } = await import("@/server/admin/users");

test("계정 삭제는 위치 확인자료를 임의 키로 보존하지 않고 파기한다", async () => {
  await deleteUserAccount("subject");
  assert.equal(operations[0], "lock");
  assert.ok(operations.includes("locationUsageLog.deleteMany"));
  assert.ok(operations.includes("locationConsentEvent.deleteMany"));
  assert.ok(operations.indexOf("locationUsageLog.deleteMany") < operations.indexOf("user.delete"));
});
