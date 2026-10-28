import assert from "node:assert/strict";
import test from "node:test";
import type { JournalEntryInput } from "@/shared/api/journal";
import type { Prisma } from "@/generated/prisma/client";
import { createDefaultHarumadiForFirstMadi } from "@/server/harumadi/firstMadi";

const input: JournalEntryInput = { title: "", content: "함께 걸었던 하루", image: null,
  placeName: "남긴 공간", sensitiveContent: false };

test("첫 마디와 기본 하루마디를 함께 저장하고 동시 요청·실패·기존 책장을 구분한다", async t => {
  type Entry = Omit<JournalEntryInput, "visitedAt"> & { id: string; ownerId: string; updatedAt: Date; visitedAt: Date };
  type Book = { id: string; ownerId: string; title: string; coverStyle: string; entries: { create: { entryId: string } } };
  let entries = new Map<string, Entry>();
  let books = new Map<string, Book>();
  let failBook = false;
  let lockedOwner: string | null = null;
  let queue = Promise.resolve();
  const db = {
    $queryRaw: async (sql: TemplateStringsArray, owner: string) => {
      assert.match(sql.join("?"), /SELECT id FROM users WHERE id = \? FOR UPDATE/);
      lockedOwner = owner;
      return [{ id: owner }];
    },
    journalEntry: {
      create: async ({ data }: { data: Entry }) => {
        assert.equal(lockedOwner, data.ownerId);
        const row = { ...data, updatedAt: new Date(), publicationStatus: "private", publicId: null,
          publishedAt: null, publicationStatusChangedAt: new Date(), sensitiveWithdrawnAt: null };
        entries.set(row.id, row); return row;
      },
      count: async ({ where }: { where: { ownerId: string } }) => [...entries.values()].filter(e => e.ownerId === where.ownerId).length,
    },
    harumadi: {
      findFirst: async ({ where }: { where: { ownerId: string } }) => [...books.values()].find(b => b.ownerId === where.ownerId) ?? null,
      create: async ({ data }: { data: Book }) => {
        assert.equal(lockedOwner, data.ownerId);
        if (failBook) throw new Error("book write failed");
        assert.equal(entries.get(data.entries.create.entryId)?.ownerId, data.ownerId);
        books.set(data.id, data); return data;
      },
    },
    systemLog: { create: async () => ({}) },
  };
  (globalThis as { prisma?: unknown }).prisma = { ...db, $transaction: async (fn: (tx: typeof db) => Promise<unknown>) => {
    const previous = queue;
    let release!: () => void;
    queue = new Promise<void>(resolve => { release = resolve; });
    await previous;
    const entrySnapshot = structuredClone(entries), bookSnapshot = structuredClone(books);
    try { return await fn(db); }
    catch (error) { entries = entrySnapshot; books = bookSnapshot; throw error; }
    finally { lockedOwner = null; release(); }
  } };
  const previous = process.env.SENSITIVE_JOURNAL_WORKFLOW_ENABLED;
  process.env.SENSITIVE_JOURNAL_WORKFLOW_ENABLED = "true";
  t.after(() => {
    if (previous === undefined) delete process.env.SENSITIVE_JOURNAL_WORKFLOW_ENABLED;
    else process.env.SENSITIVE_JOURNAL_WORKFLOW_ENABLED = previous;
  });
  const { createJournalEntry } = await import("@/server/journal/service");

  await t.test("첫 글 마디를 담은 기본 하루마디는 표지만 설정해 생성한다", async () => {
    const entry = await createJournalEntry("new-owner", input);
    const book = [...books.values()].find(b => b.ownerId === "new-owner")!;
    assert.equal(book.title, "우리의 작은 하루");
    assert.equal(book.coverStyle, "white-plain");
    assert.equal("innerStyle" in book, false);
    assert.equal(book.entries.create.entryId, entry.id);
    await createJournalEntry("new-owner", input);
    assert.equal([...books.values()].filter(b => b.ownerId === "new-owner").length, 1);
  });
  await t.test("같은 계정에서 동시에 작성해도 기본 하루마디는 한 권만 만든다", async () => {
    await Promise.all([createJournalEntry("parallel", input), createJournalEntry("parallel", input)]);
    assert.equal([...books.values()].filter(b => b.ownerId === "parallel").length, 1);
    assert.equal([...entries.values()].filter(e => e.ownerId === "parallel").length, 2);
  });
  await t.test("하루마디 저장 실패 시 마디도 롤백하고 재시도하면 한 쌍만 저장한다", async () => {
    failBook = true;
    await assert.rejects(createJournalEntry("retry", input), /book write failed/);
    assert.equal([...entries.values()].filter(e => e.ownerId === "retry").length, 0);
    failBook = false;
    await createJournalEntry("retry", input);
    assert.equal([...books.values()].filter(b => b.ownerId === "retry").length, 1);
    assert.equal([...entries.values()].filter(e => e.ownerId === "retry").length, 1);
  });
  await t.test("사용자가 미리 만든 하루마디를 덮거나 기본 하루마디를 추가하지 않는다", async () => {
    books.set("manual", { id: "manual", ownerId: "prepared", title: "직접 만든 책", coverStyle: "green-plain", entries: { create: { entryId: "existing" } } });
    await createJournalEntry("prepared", input);
    assert.equal([...books.values()].filter(b => b.ownerId === "prepared").length, 1);
    assert.equal(books.get("manual")?.title, "직접 만든 책");
  });
  await t.test("기존 마디가 있는 계정에는 기본 하루마디를 소급 생성하지 않는다", async () => {
    entries.set("old-entry", { ...input, id: "old-entry", ownerId: "existing", visitedAt: new Date(), updatedAt: new Date() });
    await createJournalEntry("existing", input);
    assert.equal([...books.values()].filter(b => b.ownerId === "existing").length, 0);
  });
});

test("첫 마디에 사진이 있어도 속지 설정 없이 같은 마디만 연결한다", async () => {
  const writes: Record<string, unknown>[] = [];
  const tx = {
    journalEntry: { count: async () => 1 },
    harumadi: { findFirst: async () => null, create: async ({ data }: { data: Record<string, unknown> }) => { writes.push(data); } },
  } as unknown as Prisma.TransactionClient;
  await createDefaultHarumadiForFirstMadi(tx, "photo-owner", { id: "photo-entry", image: "journal-images/test.webp" });
  assert.equal(writes[0].ownerId, "photo-owner");
  assert.equal("innerStyle" in writes[0], false);
  assert.deepEqual(writes[0].entries, { create: { entryId: "photo-entry" } });
});
