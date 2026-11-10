import assert from "node:assert/strict";
import test from "node:test";

test("작성 확인 후 공유 범위가 바뀌면 책 잠금 아래에서 거절하고 원본을 생성하지 않는다", async () => {
  let locked = false, created = 0;
  const tx = {
    $queryRaw: async (sql: TemplateStringsArray) => { if (sql.join("").includes("FROM harumadis")) locked = true; return []; },
    harumadi: { findUnique: async () => {
      assert.equal(locked, true);
      return { id: "book", ownerId: "owner", title: "테스트", collaborationStartedAt: new Date(), members: [] };
    } },
    journalEntry: { create: async () => { created++; throw Error("must not create"); } },
  };
  (globalThis as { prisma?: unknown }).prisma = { $transaction: async (fn: (tx: unknown) => unknown) => fn(tx) };
  const { createJournalEntry } = await import("../src/server/journal/service");
  await assert.rejects(createJournalEntry("owner", { title: "", content: "개인 이야기", image: null, placeName: "", harumadiId: "book", expectedHarumadiShared: false, sensitiveContent: false }), { status: 409, message: /공유 범위가 바뀌었어요/ });
  assert.equal(created, 0);
});
