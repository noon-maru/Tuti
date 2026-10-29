import assert from "node:assert/strict";
import test from "node:test";

test("오래전에 만든 책도 초대 수락 시 책장 앞에 놓고 개인 책과 공유 책을 중복 없이 이어 읽는다", async t => {
  process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/test";
  process.env.HARUMADI_TOGETHER_ENABLED = "true";
  const make = (id: string, ownerId: string, at: string) => ({ id, ownerId, title: id, coverStyle: "white-plain", backCoverText: "", revision: 1,
    createdAt: new Date(at), updatedAt: new Date(at), entries: [], collaborationStartedAt: ownerId === "me" ? null : new Date(at),
    owner: { displayName: ownerId }, members: ownerId === "me" ? [] : [{ userId: "me" }] });
  const owned = Array.from({ length: 13 }, (_, i) => make(`owned-${i}`, "me", new Date(Date.UTC(2026, 9, 28) - i * 86400000).toISOString()));
  const shared = make("old-shared", "friend", "2025-01-01T00:00:00Z");
  const joinedAt = new Date("2026-10-29T00:00:00Z");
  const tx = {
    harumadi: {
      findFirst: async ({ where }: { where: { id: string } }) => {
        const book = [shared, ...owned].find(book => book.id === where.id);
        return book ? { ...book, members: book.ownerId === "me" ? [] : [{ joinedAt }] } : null;
      },
      findMany: async ({ where }: { where: { ownerId: string; OR?: [{ createdAt: { lt: Date } }, { createdAt: Date; id: { lt: string } }] } }) => {
        assert.equal(where.ownerId, "me");
        const before = where.OR?.[0].createdAt.lt, id = where.OR?.[1].id.lt;
        return owned.filter(book => !before || book.createdAt < before || book.createdAt.getTime() === before.getTime() && book.id < id!).slice(0, 13);
      },
    },
    harumadiMember: { findMany: async ({ where }: { where: { userId: string; endedAt: null; OR?: [{ joinedAt: { lt: Date } }, { joinedAt: Date; harumadiId: { lt: string } }] } }) => {
      assert.equal(where.userId, "me"); assert.equal(where.endedAt, null);
      const before = where.OR?.[0].joinedAt.lt, id = where.OR?.[1].harumadiId.lt;
      return !before || joinedAt < before || joinedAt.getTime() === before.getTime() && shared.id < id! ? [{ joinedAt, harumadi: shared }] : [];
    } },
    journalEntry: { count: async ({ where }: { where: { ownerId: string } }) => { assert.equal(where.ownerId, "me"); return 3; } },
  };
  const previous = (globalThis as { prisma?: unknown }).prisma;
  (globalThis as { prisma?: unknown }).prisma = { $transaction: async (fn: (db: typeof tx) => Promise<unknown>) => fn(tx) };
  t.after(() => { (globalThis as { prisma?: unknown }).prisma = previous; });
  const { listHarumadis } = await import("@/server/harumadi/service");
  const first = await listHarumadis("me", null);
  assert.equal(first.harumadis[0].id, "old-shared");
  assert.equal(first.harumadis[0].role, "contributor");
  assert.equal(first.harumadis[0].ownerName, "friend");
  assert.equal(first.recordCount, 3);
  assert.equal(first.harumadis.length, 12);
  assert.ok(first.nextCursor);
  const second = await listHarumadis("me", first.nextCursor);
  const ids = [...first.harumadis, ...second.harumadis].map(book => book.id);
  assert.equal(ids.length, 14); assert.equal(new Set(ids).size, 14);
  assert.equal(second.nextCursor, null);
  await assert.rejects(listHarumadis("me", "another-private-book"), { status: 409 });
});
