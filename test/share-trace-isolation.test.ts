import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

test("공유 이미지 확정은 한 내용만 저장하고 같은 내용 재시도만 허용한다", async t => {
  const globals = globalThis as unknown as { prisma?: unknown };
  const oldDb = globals.prisma, oldSecret = process.env.MADI_SHARE_TRACE_SECRET;
  process.env.MADI_SHARE_TRACE_SECRET = "fixture-only-share-trace-secret-123456789";
  let row = { traceId: "trace", shortCode: "short", originUserId: "owner", resolvedUserId: "owner", entryId: "entry", issuedAt: new Date(), finalizedAt: null as Date | null, imageSha256: null as string | null, signature: null as string | null };
  let queue = Promise.resolve(), exists = true;
  const db = {
    $queryRaw: async () => [], journalEntry: { findFirst: async () => exists ? { id: "entry" } : null },
    journalShareTrace: {
      findFirst: async () => structuredClone(row), findUniqueOrThrow: async () => structuredClone(row),
      updateMany: async ({ where, data }: { where: { finalizedAt: null }; data: Partial<typeof row> }) => {
        assert.equal(where.finalizedAt, null);
        if (row.finalizedAt) return { count: 0 };
        Object.assign(row, data); return { count: 1 };
      },
    },
    $transaction: (work: (tx: unknown) => Promise<unknown>) => {
      const next = queue.then(() => work(db)); queue = next.then(() => {}, () => {}); return next;
    },
  };
  globals.prisma = db;
  t.after(() => { globals.prisma = oldDb; if (oldSecret === undefined) delete process.env.MADI_SHARE_TRACE_SECRET; else process.env.MADI_SHARE_TRACE_SECRET = oldSecret; });
  const { finalizeJournalShareTrace } = await import("../src/server/journal/shareTrace");
  const images = await Promise.all(["red", "blue"].map(background => sharp({ create: { width: 1080, height: 1350, channels: 3, background } }).png().toBuffer()));
  const finalize = (png: Uint8Array) => finalizeJournalShareTrace({ ownerId: "owner", entryId: "entry", traceId: "trace", png });
  const results = await Promise.allSettled(images.map(finalize));
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  const winner = results.findIndex(r => r.status === "fulfilled");
  const saved = row.imageSha256;
  await finalize(images[winner]); assert.equal(row.imageSha256, saved);
  await assert.rejects(finalize(images[1 - winner]), { status: 409 });
  exists = false; assert.equal(await finalize(images[winner]), null);
  row = { ...row, finalizedAt: null };
});
