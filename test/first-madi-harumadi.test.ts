import assert from "node:assert/strict";
import test from "node:test";
import type { JournalEntryInput } from "@/shared/api/journal";
import type { Prisma } from "@/generated/prisma/client";
import { createDefaultHarumadiForFirstMadi } from "@/server/harumadi/firstMadi";
import { lifecycleData } from "@/server/analytics/lifecycle";

const input: JournalEntryInput = { title: "", content: "함께 걸었던 하루", image: null,
  placeName: "남긴 공간", sensitiveContent: false };

test("첫 마디와 기본 하루마디를 함께 저장하고 동시 요청·실패·기존 책장을 구분한다", async t => {
  type Entry = Omit<JournalEntryInput, "visitedAt"> & { id: string; ownerId: string; updatedAt: Date; visitedAt: Date };
  type Book = { id: string; ownerId: string; title: string; coverStyle: string; entries: { create: { entryId: string } } };
  let entries = new Map<string, Entry>();
  let books = new Map<string, Book>();
  let failBook = false;
  let failMetric = false;
  let events = new Map<string, ReturnType<typeof lifecycleData>>();
  let lockedOwner: string | null = null;
  let queue = Promise.resolve();
  const db = {
    $queryRaw: async (sql: TemplateStringsArray, owner: string) => {
      assert.match(sql.join("?"), /SELECT id FROM users WHERE id = \? FOR UPDATE/);
      lockedOwner = owner;
      return [{ id: owner }];
    },
    journalEntry: {
      findFirst: async ({ where }: { where: { id: string; ownerId: string } }) => { const entry = entries.get(where.id); return entry?.ownerId === where.ownerId ? entry : null; },
      create: async ({ data }: { data: Entry }) => {
        assert.equal(lockedOwner, data.ownerId);
        const row = { ...data, updatedAt: new Date(), publicationStatus: "private", publicId: null,
          publishedAt: null, publicationStatusChangedAt: new Date(), sensitiveWithdrawnAt: null };
        entries.set(row.id, row); return row;
      },
      count: async ({ where }: { where: { ownerId: string } }) => [...entries.values()].filter(e => e.ownerId === where.ownerId).length,
    },
    harumadi: {
      findUnique: async ({ where }: { where: { id: string } }) => books.get(where.id) ?? null,
      findFirst: async ({ where }: { where: { ownerId: string } }) => [...books.values()].find(b => b.ownerId === where.ownerId) ?? null,
      create: async ({ data }: { data: Book }) => {
        assert.equal(lockedOwner, data.ownerId);
        if (failBook) throw new Error("book write failed");
        assert.equal(entries.get(data.entries.create.entryId)?.ownerId, data.ownerId);
        books.set(data.id, data); return data;
      },
    },
    lifecycleEvent: {
      findUnique: async ({ where }: { where: { requestKey: string } }) => [...events.values()].find(row => row.requestKey === where.requestKey) ?? null,
      createMany: async ({ data }: { data: Array<ReturnType<typeof lifecycleData>> }) => {
        for (const row of data) {
          if (failMetric && row.name === "madi_created") throw new Error("metric write failed");
          if (!events.has(row.occurrenceKey)) events.set(row.occurrenceKey, row);
        }
        return { count: data.length };
      },
    },
    systemLog: { create: async () => ({}) },
  };
  (globalThis as { prisma?: unknown }).prisma = { ...db, $transaction: async (fn: (tx: typeof db) => Promise<unknown>) => {
    const previous = queue;
    let release!: () => void;
    queue = new Promise<void>(resolve => { release = resolve; });
    await previous;
    const entrySnapshot = structuredClone(entries), bookSnapshot = structuredClone(books), eventSnapshot = structuredClone(events);
    try { return await fn(db); }
    catch (error) { entries = entrySnapshot; books = bookSnapshot; events = eventSnapshot; throw error; }
    finally { lockedOwner = null; release(); }
  } };
  const previous = process.env.SENSITIVE_MADI_WORKFLOW_ENABLED;
  process.env.SENSITIVE_MADI_WORKFLOW_ENABLED = "true";
  t.after(() => {
    if (previous === undefined) delete process.env.SENSITIVE_MADI_WORKFLOW_ENABLED;
    else process.env.SENSITIVE_MADI_WORKFLOW_ENABLED = previous;
  });
  const { createJournalEntry } = await import("@/server/journal/service");

  await t.test("중복 POST는 같은 원본·성공 사건을 반환하고 삭제·철회·내용 변경 요청을 재생성하지 않는다", async () => {
    const request = { ...input, requestId: "bb17e0d4-d207-4d0e-9bf0-d00604d60e8a" };
    const [first, second] = await Promise.all([createJournalEntry("idempotent", request), createJournalEntry("idempotent", request)]);
    assert.equal(first.id, second.id);
    assert.equal([...entries.values()].filter(e => e.ownerId === "idempotent").length, 1);
    assert.equal([...events.values()].filter(e => e.userId === "idempotent" && e.name === "madi_created").length, 1);
    await assert.rejects(createJournalEntry("idempotent", { ...request, content: "바뀐 내용" }), { status: 409 });
    Object.assign(entries.get(first.id)!, { sensitiveWithdrawnAt: new Date() });
    await assert.rejects(createJournalEntry("idempotent", request));
    entries.delete(first.id);
    await assert.rejects(createJournalEntry("idempotent", request), { status: 409 });
    assert.equal([...entries.values()].filter(e => e.ownerId === "idempotent").length, 0);
  });
  await t.test("성공 사건 저장에 실패하면 원본·자동 책·관련 사건을 모두 롤백한다", async () => {
    failMetric = true;
    await assert.rejects(createJournalEntry("atomic-metrics", input), /metric write failed/);
    assert.equal([...entries.values()].filter(e => e.ownerId === "atomic-metrics").length, 0);
    assert.equal([...books.values()].filter(e => e.ownerId === "atomic-metrics").length, 0);
    assert.equal([...events.values()].filter(e => e.userId === "atomic-metrics").length, 0);
    failMetric = false;
  });

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
  const link = (writes[0].entries as { create: { id: string; entryId: string } }).create;
  assert.equal(link.entryId, "photo-entry");
  assert.match(link.id, /^[a-f0-9-]{36}$/);
});
