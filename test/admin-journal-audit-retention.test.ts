import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/test";
const queries: Array<{ table: string; where: unknown }> = [];
const delegate = (table: string) => ({ deleteMany: async ({ where }: { where: unknown }) => { queries.push({ table, where }); return { count: 1 }; } });
(globalThis as { prisma?: unknown }).prisma = {
  ...Object.fromEntries(["userSession", "emailVerificationCode", "oAuthAuthorization", "productActivityEvent", "trafficObservation", "trafficBlockRule", "systemLog", "adminJournalAccessAudit"].map((name) => [name, delegate(name)])),
  $transaction: (operations: Array<Promise<unknown>>) => Promise.all(operations),
};
const { adminJournalAccessAuditCutoff } = await import("@/server/admin/journalAccessAudit");
const { purgeExpiredAuthRecords } = await import("@/server/auth/retention");

test("관리자 기록 접근 증거만 2년 기준으로 정리하며 일반 보안 이력 90일과 분리한다", async () => {
  const now = new Date("2026-10-19T03:00:00Z");
  const result = await purgeExpiredAuthRecords(now);
  const cutoff = new Date("2024-10-19T03:00:00Z");
  assert.deepEqual(queries.find((item) => item.table === "adminJournalAccessAudit")?.where, { occurredAt: { lt: cutoff } });
  assert.ok(queries.some((item) => item.table === "systemLog" && JSON.stringify(item.where) === JSON.stringify({ category: "journal", action: "journal.admin.viewed", createdAt: { lt: cutoff } })));
  assert.equal(result.adminJournalAccessAudits, 1);
  assert.equal(result.legacyAdminJournalAccessLogs, 1);
  const security = queries.find((item) => item.table === "systemLog" && (item.where as { category: string }).category === "security");
  assert.equal((security?.where as { createdAt: { lte: Date } }).createdAt.lte.getTime(), now.getTime() - 90 * 86400000);
  const interactions = queries.find(item => item.table === "systemLog" && (item.where as { category: string }).category === "product");
  assert.equal((interactions?.where as { createdAt: { lte: Date } }).createdAt.lte.getTime(), now.getTime() - 180 * 86400000);
  assert.equal(result.productInteractions, 1);
});
test("윤일 경계는 보존기간을 단축하지 않도록 보수적으로 계산한다", () => {
  assert.equal(adminJournalAccessAuditCutoff(new Date("2028-02-29T12:34:56Z")).toISOString(), "2026-02-28T12:34:56.000Z");
});
