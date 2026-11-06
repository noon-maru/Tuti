import assert from "node:assert/strict";
import test from "node:test";

test("마디 삭제는 잠금 뒤 최신 사진을 정리 예약하고 예약 실패 시 삭제도 롤백한다", async t => {
  const globals = globalThis as unknown as { prisma?: unknown };
  const previous = globals.prisma, oldFlag = process.env.PRIVACY_REPLAY_LEDGER_ENABLED;
  process.env.PRIVACY_REPLAY_LEDGER_ENABLED = "false";
  let row: { image: string; ownerId: string; sensitiveContent: boolean; sensitiveWithdrawnAt: null } | null;
  let locked = false, failEnqueue = false;
  const payloads: { images: string[] }[] = [];
  const db = {
    $queryRaw: async () => { locked = true; return [{ id: "entry" }]; },
    journalEntry: {
      findFirst: async () => structuredClone(row), findUnique: async () => structuredClone(row),
      delete: async () => { assert.ok(locked); row = null; },
      deleteMany: async () => { assert.ok(locked); row = null; return { count: 1 }; },
    },
    journalShareTrace: { deleteMany: async () => ({ count: 0 }) }, contentReport: { updateMany: async () => ({ count: 0 }) },
    userDataCleanupJob: {
      create: async ({ data }: { data: { id: string; payload: { images: string[] } } }) => { if (failEnqueue) throw new Error("outbox failed"); payloads.push(data.payload); return data; },
      updateMany: async () => ({ count: 0 }),
    }, systemLog: { create: async () => ({}) },
    $transaction: async (work: (tx: unknown) => Promise<unknown>) => {
      row!.image = "journal-images/new.webp"; // 수정이 삭제의 잠금보다 먼저 커밋됨
      const before = structuredClone(row); locked = false;
      try { return await work(db); } catch (error) { row = before; throw error; }
    },
  };
  globals.prisma = db;
  t.after(() => { globals.prisma = previous; if (oldFlag === undefined) delete process.env.PRIVACY_REPLAY_LEDGER_ENABLED; else process.env.PRIVACY_REPLAY_LEDGER_ENABLED = oldFlag; });
  const { deleteJournalEntry, forceDeleteJournalEntry } = await import("../src/server/journal/service");
  for (const erase of [() => deleteJournalEntry("owner", "entry"), () => forceDeleteJournalEntry("entry")]) {
    row = { image: "journal-images/old.webp", ownerId: "owner", sensitiveContent: false, sensitiveWithdrawnAt: null };
    await erase();
    assert.equal(row, null);
    assert.deepEqual(payloads.at(-1)?.images, ["journal-images/new.webp"]);
    row = { image: "journal-images/old.webp", ownerId: "owner", sensitiveContent: false, sensitiveWithdrawnAt: null };
    failEnqueue = true;
    await assert.rejects(erase(), /outbox failed/);
    assert.ok(row); failEnqueue = false;
  }
});
