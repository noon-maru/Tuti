import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { parseNotebookSettings, parseNotebookUpdate } from "../src/shared/api/journalNotebook";
import { parseJournalBookInput } from "../src/shared/api/journalBook";
import { requiresServiceTerms } from "../src/shared/legal/serviceTerms";

const settings = { title: "우리의 다음 하루", coverStyle: "green-plain", innerStyle: "photo" } as const;
test("표지와 속지로 빈 기록집을 만들고 기록 연결은 별도로 검증한다", () => {
  assert.deepEqual(parseNotebookSettings(settings), settings);
  assert.deepEqual(parseNotebookUpdate({ ...settings, revision: 1, entryIds: [] }), { ...settings, revision: 1, entryIds: [] });
  for (const invalid of [{ title: " " }, { title: "가".repeat(81) }, { coverStyle: "other" }, { innerStyle: "other" }, { freeformNonSensitiveConfirmed: "yes" }]) assert.equal(parseNotebookSettings({ ...settings, ...invalid }), null);
  for (const invalid of [{ revision: 0 }, { revision: 1.1 }, { entryIds: ["a", "a"] }, { entryIds: Array.from({ length: 13 }, (_, i) => `id-${i}`) }, { entryIds: ["../foreign"] }]) assert.equal(parseNotebookUpdate({ ...settings, revision: 1, entryIds: [], ...invalid }), null);
});
test("속지 설정은 PDF 입력으로 전달되며 이전 PDF 입력은 그대로 허용한다", () => {
  const input = { ...settings, entryIds: ["one"], letter: "", coverEntryId: null };
  assert.equal(parseJournalBookInput({ ...input, innerStyle: "text" })?.innerStyle, "text");
  assert.equal(parseJournalBookInput({ ...input, innerStyle: "invalid" }), null);
  const { innerStyle, ...legacy } = input;
  assert.equal(innerStyle, "photo");
  assert.ok(parseJournalBookInput(legacy));
});
test("저널 제작 CTA를 제거하고 새 기록집 저장과 PDF 저장을 분리한다", () => {
  const journal = readFileSync("src/features/tuti/screens/journal/JournalScreen.tsx", "utf8");
  assert.doesNotMatch(journal, /JournalBookEntry/);
  const home = readFileSync("src/features/tuti/flows/LibraryHomeFlow.tsx", "utf8");
  assert.match(home, /router\.push\("\/journal\/notebook"\)/);
  const flow = readFileSync("src/features/tuti/flows/JournalNotebookFlow.tsx", "utf8");
  const saveSettings = flow.slice(flow.indexOf("async function saveSettings"), flow.indexOf("async function saveEntries"));
  assert.doesNotMatch(saveSettings, /createJournalBook|exportJournalBookPdf/);
  assert.match(flow, /빈 기록집 만들기/);
  assert.match(flow, /PDF로 저장하기/);
  assert.equal(requiresServiceTerms("/api/journal-notebooks", "POST"), true);
  assert.equal(requiresServiceTerms("/api/journal-notebooks/book", "PATCH"), true);
  assert.equal(requiresServiceTerms("/api/journal-notebooks/book", "DELETE"), false);
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const links = schema.slice(schema.indexOf("model JournalNotebookEntry"), schema.indexOf("model JournalBook {"));
  assert.equal((links.match(/onDelete: Cascade/g) ?? []).length, 2);
});

test("사진·글 속지 선택이 실제 PDF의 사진 포함 여부를 바꾸며 표지 사진은 유지한다", async () => {
  const sharp = (await import("sharp")).default;
  const { PDFDocument, PDFName, PDFRawStream } = await import("pdf-lib");
  const { renderJournalBook } = await import("../src/server/pdf/journalBook");
  const image = await sharp({ create: { width: 16, height: 20, channels: 3, background: "#EBF5D5" } }).jpeg().toBuffer();
  const entries = [{ id: "entry", title: "작은 하루", content: "함께 걸었어요.", placeName: "공원", visitedAt: new Date("2026-10-25T00:00:00Z"), image }];
  async function images(innerStyle: "photo" | "text", photoCover = false) {
    const bytes = await renderJournalBook({ title: "기록집", coverStyle: photoCover ? "green-image" : "green-plain", innerStyle, entryIds: ["entry"], letter: "", coverEntryId: photoCover ? "entry" : null }, entries);
    const document = await PDFDocument.load(bytes);
    return document.context.enumerateIndirectObjects().filter(([, value]) => value instanceof PDFRawStream && value.dict.get(PDFName.of("Subtype"))?.toString() === "/Image").length;
  }
  assert.equal(await images("text"), 0);
  assert.ok(await images("photo") > 0);
  assert.ok(await images("text", true) > 0);
});

test("기록집 서버는 빈 틀·소유권·낙관적 잠금·민감정보를 구분한다", async () => {
  const rows = new Map<string, { id: string; ownerId: string; title: string; coverStyle: string; innerStyle: string; revision: number; createdAt: Date; updatedAt: Date }>();
  const links = new Map<string, string[]>();
  const records = new Map([["mine", { id: "mine", ownerId: "owner", sensitiveContent: false, sensitiveConsentVersion: null, sensitiveWithdrawnAt: null as Date | null }], ["foreign", { id: "foreign", ownerId: "someone-else", sensitiveContent: false, sensitiveConsentVersion: null, sensitiveWithdrawnAt: null as Date | null }]]);
  const find = (where: { id?: string; ownerId?: string }) => [...rows.values()].find(row => (!where.id || row.id === where.id) && (!where.ownerId || row.ownerId === where.ownerId));
  const dto = (row: NonNullable<ReturnType<typeof find>>) => ({ ...row, entries: (links.get(row.id) ?? []).filter(id => !records.get(id)?.sensitiveWithdrawnAt).map(entryId => ({ entryId })) });
  const model = {
    create: async ({ data }: { data: Omit<ReturnType<typeof dto>, "entries" | "revision" | "createdAt" | "updatedAt"> }) => {
      const row = { ...data, revision: 1, createdAt: new Date(), updatedAt: new Date() }; rows.set(row.id, row); return dto(row);
    },
    findFirst: async ({ where }: { where: { id?: string; ownerId?: string } }) => { const row = find(where); return row ? dto(row) : null; },
    findFirstOrThrow: async ({ where }: { where: { id?: string; ownerId?: string } }) => { const row = find(where); if (!row) throw new Error("missing"); return dto(row); },
    findMany: async ({ where }: { where: { ownerId: string } }) => [...rows.values()].filter(row => row.ownerId === where.ownerId).map(dto),
    updateMany: async ({ where, data }: { where: { id: string; ownerId: string; revision: number }; data: { title: string; coverStyle: string; innerStyle: string } }) => {
      const row = find(where); if (!row || row.revision !== where.revision) return { count: 0 };
      Object.assign(row, { ...data, revision: row.revision + 1 }); return { count: 1 };
    },
  };
  const database = {
    journalNotebook: model,
    journalEntry: { count: async () => 1, findMany: async ({ where }: { where: { ownerId: string; id: { in: string[] } } }) => [...records.values()].filter(record => record.ownerId === where.ownerId && where.id.in.includes(record.id)) },
    journalNotebookEntry: {
      deleteMany: async ({ where }: { where: { notebookId: string } }) => { links.set(where.notebookId, []); },
      createMany: async ({ data }: { data: { notebookId: string; entryId: string }[] }) => { for (const link of data) links.set(link.notebookId, [...(links.get(link.notebookId) ?? []), link.entryId]); },
    },
    $queryRaw: async () => [],
  };
  (globalThis as { prisma?: unknown }).prisma = { ...database, $transaction: async (fn: (tx: typeof database) => Promise<unknown>) => {
    const snapshot = structuredClone(rows); const linkSnapshot = structuredClone(links);
    try { return await fn(database); } catch (error) { rows.clear(); for (const [id, row] of snapshot) rows.set(id, row); links.clear(); for (const [id, ids] of linkSnapshot) links.set(id, ids); throw error; }
  } };
  const { createNotebook, readNotebook, updateNotebook, listNotebooks } = await import("../src/server/journal/notebooks");
  const book = await createNotebook("owner", settings);
  assert.deepEqual(book.entryIds, []);
  assert.equal(book.revision, 1);
  await assert.rejects(readNotebook("other", book.id), /찾지 못/);
  await assert.rejects(updateNotebook("other", book.id, { ...settings, revision: 1, entryIds: ["mine"] }), /찾지 못/);
  await assert.rejects(updateNotebook("owner", book.id, { ...settings, revision: 1, entryIds: ["foreign"] }), /선택한 기록/);
  assert.equal((await readNotebook("owner", book.id)).revision, 1);
  const filled = await updateNotebook("owner", book.id, { ...settings, revision: 1, entryIds: ["mine"] });
  assert.deepEqual(filled.entryIds, ["mine"]);
  await assert.rejects(updateNotebook("owner", book.id, { ...settings, revision: 1, entryIds: [] }), /다른 화면/);
  records.get("mine")!.sensitiveWithdrawnAt = new Date();
  assert.deepEqual((await readNotebook("owner", book.id)).entryIds, []);
  await assert.rejects(updateNotebook("owner", book.id, { ...settings, revision: 2, entryIds: ["mine"] }), /민감정보|기록/);
  assert.equal((await listNotebooks("owner", null)).notebooks.length, 1);
});
