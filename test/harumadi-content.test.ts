import assert from "node:assert/strict";
import test from "node:test";
import { harumadiContent } from "./fixtures/harumadiContent";

const fixture = harumadiContent();
const record = { ...fixture.entries[0], ownerId: "owner", updatedAt: new Date("2026-10-27T00:00:00Z"),
  visitedAt: new Date("2026-10-26T00:00:00Z"), publicId: null, publishedAt: null, publicationStatusChangedAt: new Date(),
  sensitiveContent: false as boolean | null, sensitiveConsentVersion: null, sensitiveWithdrawnAt: null as Date | null };
let calls = 0;
const tx = {
  harumadi: { findFirst: async ({ where }: { where: { ownerId: string; id: string } }) => {
    calls++; if (where.ownerId !== "owner" || where.id !== "book-a") return null;
    return { ...fixture.harumadi, createdAt: new Date(fixture.harumadi.createdAt), updatedAt: new Date(fixture.harumadi.updatedAt), entries: [{ entry: record }] };
  } }, journalEntry: { count: async () => 3 },
};
(globalThis as { prisma?: unknown }).prisma = { ...tx, $transaction: async (action: (db: typeof tx) => unknown, options: unknown) => {
  assert.deepEqual(options, { isolationLevel: "RepeatableRead" }); return action(tx);
} };

test("책에 담긴 마디만 같은 스냅샷으로 읽고 본문 수정도 별도 버전으로 반영한다", async () => {
  const { readHarumadiContent } = await import("@/server/harumadi/content");
  const first = await readHarumadiContent("owner", "book-a");
  assert.equal(first.entries.length, 1); assert.equal(first.totalRecordCount, 3); assert.equal(first.cacheable, true);
  record.title = "바뀐 제목"; record.updatedAt = new Date("2026-10-27T01:00:00Z");
  const next = await readHarumadiContent("owner", "book-a");
  assert.equal(next.harumadi.revision, first.harumadi.revision); assert.notEqual(next.version, first.version);
  assert.equal(next.entries[0].title, "바뀐 제목"); assert.equal(calls, 2);
});

test("다른 계정·잘못 연결된 마디·철회 데이터는 캐시 응답으로 우회하지 않는다", async t => {
  const previous = process.env.SENSITIVE_MADI_WORKFLOW_ENABLED;
  t.after(() => { if (previous === undefined) delete process.env.SENSITIVE_MADI_WORKFLOW_ENABLED; else process.env.SENSITIVE_MADI_WORKFLOW_ENABLED = previous; record.sensitiveContent = false; });
  process.env.SENSITIVE_MADI_WORKFLOW_ENABLED = "true";
  const { readHarumadiContent } = await import("@/server/harumadi/content");
  await assert.rejects(readHarumadiContent("other", "book-a"), { status: 404 });
  record.ownerId = "other"; await assert.rejects(readHarumadiContent("owner", "book-a"), { status: 403 }); record.ownerId = "owner";
  record.sensitiveWithdrawnAt = new Date(); await assert.rejects(readHarumadiContent("owner", "book-a"), { status: 409 }); record.sensitiveWithdrawnAt = null;
  record.sensitiveContent = null;
  await assert.rejects(readHarumadiContent("owner", "book-a"), { status: 409 });
  process.env.SENSITIVE_MADI_WORKFLOW_ENABLED = "false";
  assert.equal((await readHarumadiContent("owner", "book-a")).cacheable, false);
});
