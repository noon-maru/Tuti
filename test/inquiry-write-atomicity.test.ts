import assert from "node:assert/strict";
import test from "node:test";

test("문의 답변·감사로그·알림 예약은 함께 커밋하고 오래된 편집을 거절한다", async t => {
  const globals = globalThis as unknown as { prisma?: unknown };
  const previousDb = globals.prisma;
  const initial = () => ({ id: "inquiry", requesterUserId: "owner", status: "pending", adminResponse: null as string | null, updatedAt: new Date("2026-01-01T00:00:00Z") });
  let row = initial(), logs = 0, jobs = 0, fail: "log" | "outbox" | null = null, race = false;
  const db = {
    customerInquiry: {
      findUnique: async () => structuredClone(row), findUniqueOrThrow: async () => structuredClone(row),
      updateMany: async ({ where, data }: { where: { updatedAt: Date }; data: Partial<typeof row> }) => {
        if (race || row.updatedAt.getTime() !== where.updatedAt.getTime()) return { count: 0 };
        Object.assign(row, data); return { count: 1 };
      },
    },
    systemLog: { create: async () => { if (fail === "log") throw new Error("log failed"); logs++; } },
    $executeRaw: async () => { if (fail === "outbox") throw new Error("outbox failed"); jobs++; return 1; },
    $transaction: async (work: (tx: unknown) => Promise<unknown>) => {
      const before = structuredClone(row), oldLogs = logs, oldJobs = jobs;
      try { return await work(db); } catch (error) { row = before; logs = oldLogs; jobs = oldJobs; throw error; }
    },
  };
  globals.prisma = db; t.after(() => { globals.prisma = previousDb; });
  const { answerInquiry } = await import("../src/server/inquiries/service");
  const version = row.updatedAt.toISOString();
  for (const fault of ["log", "outbox"] as const) {
    fail = fault;
    await assert.rejects(answerInquiry("admin", row.id, "answered", "답변", version), /failed/);
    assert.deepEqual(row, initial()); assert.equal(logs, 0); assert.equal(jobs, 0);
  }
  fail = null; race = true;
  await assert.rejects(answerInquiry("admin", row.id, "answered", "답변", version), { status: 409 });
  race = false;
  await answerInquiry("admin", row.id, "answered", "답변", version);
  assert.equal(row.status, "answered"); assert.equal(logs, 1); assert.equal(jobs, 1);
  await assert.rejects(answerInquiry("other-admin", row.id, "answered", "덮어쓰기", version), { status: 409 });
  assert.equal(row.adminResponse, "답변"); assert.equal(jobs, 1);
  await assert.rejects(answerInquiry("admin", row.id, "answered", "답변", ""), { status: 400 });
});
