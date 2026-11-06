import assert from "node:assert/strict";
import test from "node:test";

test("문의 제한은 사용자 잠금 뒤 집계하여 동시 접수에도 5회를 넘지 않는다", async t => {
  const globals = globalThis as unknown as { prisma?: unknown };
  const old = globals.prisma;
  let count = 0, locked = false, failLog = false, exists = true, queue = Promise.resolve();
  const db = {
    $queryRaw: async () => { locked = true; return exists ? [{ id: "owner" }] : []; },
    customerInquiry: {
      count: async () => { assert.ok(locked); return count; },
      create: async () => { count++; return { id: `inquiry-${count}`, status: "pending", createdAt: new Date() }; },
    },
    systemLog: { create: async () => { if (failLog) throw new Error("log failed"); } },
    $transaction: (work: (tx: unknown) => Promise<unknown>) => {
      const next = queue.then(async () => { const before = count; locked = false; try { return await work(db); } catch (error) { count = before; throw error; } });
      queue = next.then(() => {}, () => {}); return next;
    },
  };
  globals.prisma = db; t.after(() => { globals.prisma = old; });
  const { createInquiry } = await import("../src/server/inquiries/service");
  const submit = () => createInquiry("owner", { category: "other", subject: "문의", message: "합성 문의 본문입니다." });
  const results = await Promise.allSettled(Array.from({ length: 10 }, submit));
  assert.equal(results.filter(r => r.status === "fulfilled").length, 5);
  assert.equal(count, 5);
  for (const result of results) if (result.status === "rejected") assert.equal(result.reason.status, 429);
  count = 0; failLog = true;
  await assert.rejects(submit(), /log failed/); assert.equal(count, 0);
  failLog = false; exists = false;
  await assert.rejects(submit(), { status: 409 }); assert.equal(count, 0);
});
