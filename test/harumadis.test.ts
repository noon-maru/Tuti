import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { parseHarumadiSettings, parseHarumadiUpdate } from "../src/shared/api/harumadi";
import { parseHarumadiPdfInput } from "../src/shared/api/harumadiPdf";
import { requiresServiceTerms } from "../src/shared/legal/serviceTerms";

const settings = { title: "우리의 다음 하루", coverStyle: "green-plain", innerStyle: "photo", freeformNonSensitiveConfirmed: true } as const;
test("표지와 속지로 빈 하루마디를 만들고 기록 연결은 별도로 검증한다", () => {
  assert.deepEqual(parseHarumadiSettings(settings), settings);
  assert.deepEqual(parseHarumadiUpdate({ ...settings, revision: 1, entryIds: [] }), { ...settings, revision: 1, entryIds: [] });
  for (const invalid of [{ title: " " }, { title: "가".repeat(81) }, { coverStyle: "other" }, { innerStyle: "other" }, { freeformNonSensitiveConfirmed: "yes" }]) assert.equal(parseHarumadiSettings({ ...settings, ...invalid }), null);
  for (const invalid of [{ revision: 0 }, { revision: 1.1 }, { entryIds: ["a", "a"] }, { entryIds: Array.from({ length: 13 }, (_, i) => `id-${i}`) }, { entryIds: ["../foreign"] }]) assert.equal(parseHarumadiUpdate({ ...settings, revision: 1, entryIds: [], ...invalid }), null);
});
test("속지 설정은 PDF 입력으로 전달되며 이전 PDF 입력은 그대로 허용한다", () => {
  const input = { ...settings, entryIds: ["one"], letter: "", coverEntryId: null };
  assert.equal(parseHarumadiPdfInput({ ...input, innerStyle: "text" })?.innerStyle, "text");
  assert.equal(parseHarumadiPdfInput({ ...input, innerStyle: "invalid" }), null);
  const { innerStyle, ...legacy } = input;
  assert.equal(innerStyle, "photo");
  assert.ok(parseHarumadiPdfInput(legacy));
});
test("저널 제작 CTA를 제거하고 새 하루마디 저장과 PDF 저장을 분리한다", () => {
  const journal = readFileSync("src/features/tuti/screens/journal/JournalScreen.tsx", "utf8");
  assert.doesNotMatch(journal, /HarumadiPdfEntry/);
  const home = readFileSync("src/features/tuti/flows/LibraryHomeFlow.tsx", "utf8");
  assert.match(home, /router\.push\("\/harumadi"\)/);
  const flow = readFileSync("src/features/tuti/flows/HarumadiFlow.tsx", "utf8");
  const saveSettings = flow.slice(flow.indexOf("async function saveSettings"), flow.indexOf("async function saveEntries"));
  assert.doesNotMatch(saveSettings, /createHarumadiPdf|exportHarumadiPdf/);
  assert.match(flow, /빈 하루마디 만들기/);
  assert.match(flow, /PDF로 저장하기/);
  assert.equal(requiresServiceTerms("/api/harumadis", "POST"), true);
  assert.equal(requiresServiceTerms("/api/harumadis/harumadiPdf", "PATCH"), true);
  assert.equal(requiresServiceTerms("/api/harumadis/harumadiPdf", "DELETE"), false);
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const links = schema.slice(schema.indexOf("model HarumadiEntryLink"), schema.indexOf("model HarumadiPdf {"));
  assert.equal((links.match(/onDelete: Cascade/g) ?? []).length, 2);
});

test("사진·글 속지 선택이 실제 PDF의 사진 포함 여부를 바꾸며 표지 사진은 유지한다", async () => {
  const sharp = (await import("sharp")).default;
  const { PDFDocument, PDFName, PDFRawStream } = await import("pdf-lib");
  const { renderHarumadiPdf } = await import("../src/server/pdf/harumadiPdf");
  const image = await sharp({ create: { width: 16, height: 20, channels: 3, background: "#EBF5D5" } }).jpeg().toBuffer();
  const entries = [{ id: "entry", title: "작은 하루", content: "함께 걸었어요.", placeName: "공원", visitedAt: new Date("2026-10-25T00:00:00Z"), image }];
  async function images(innerStyle: "photo" | "text", photoCover = false) {
    const bytes = await renderHarumadiPdf({ title: "하루마디", coverStyle: photoCover ? "green-image" : "green-plain", innerStyle, entryIds: ["entry"], letter: "", coverEntryId: photoCover ? "entry" : null }, entries);
    const document = await PDFDocument.load(bytes);
    return document.context.enumerateIndirectObjects().filter(([, value]) => value instanceof PDFRawStream && value.dict.get(PDFName.of("Subtype"))?.toString() === "/Image").length;
  }
  assert.equal(await images("text"), 0);
  assert.ok(await images("photo") > 0);
  assert.ok(await images("text", true) > 0);
});

test("하루마디 서버는 빈 틀·소유권·낙관적 잠금·민감정보를 구분한다", async t => {
  const previous = process.env.SENSITIVE_JOURNAL_WORKFLOW_ENABLED;
  process.env.SENSITIVE_JOURNAL_WORKFLOW_ENABLED = "true";
  t.after(() => { if (previous === undefined) delete process.env.SENSITIVE_JOURNAL_WORKFLOW_ENABLED; else process.env.SENSITIVE_JOURNAL_WORKFLOW_ENABLED = previous; });
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
    harumadi: model,
    journalEntry: { count: async () => 1, findMany: async ({ where }: { where: { ownerId: string; id: { in: string[] } } }) => [...records.values()].filter(record => record.ownerId === where.ownerId && where.id.in.includes(record.id)) },
    harumadiEntryLink: {
      deleteMany: async ({ where }: { where: { harumadiId: string } }) => { links.set(where.harumadiId, []); },
      createMany: async ({ data }: { data: { harumadiId: string; entryId: string }[] }) => { for (const link of data) links.set(link.harumadiId, [...(links.get(link.harumadiId) ?? []), link.entryId]); },
    },
    $queryRaw: async () => [],
  };
  (globalThis as { prisma?: unknown }).prisma = { ...database, $transaction: async (fn: (tx: typeof database) => Promise<unknown>) => {
    const snapshot = structuredClone(rows); const linkSnapshot = structuredClone(links);
    try { return await fn(database); } catch (error) { rows.clear(); for (const [id, row] of snapshot) rows.set(id, row); links.clear(); for (const [id, ids] of linkSnapshot) links.set(id, ids); throw error; }
  } };
  const { createHarumadi, readHarumadi, updateHarumadi, listHarumadis } = await import("../src/server/harumadi/service");
  await assert.rejects(createHarumadi("owner", { ...settings, freeformNonSensitiveConfirmed: false }), { status: 409 });
  const harumadiPdf = await createHarumadi("owner", settings);
  assert.deepEqual(harumadiPdf.entryIds, []);
  assert.equal(harumadiPdf.revision, 1);
  await assert.rejects(readHarumadi("other", harumadiPdf.id), /찾지 못/);
  await assert.rejects(updateHarumadi("other", harumadiPdf.id, { ...settings, revision: 1, entryIds: ["mine"] }), /찾지 못/);
  await assert.rejects(updateHarumadi("owner", harumadiPdf.id, { ...settings, revision: 1, entryIds: ["foreign"] }), /선택한 마디/);
  assert.equal((await readHarumadi("owner", harumadiPdf.id)).revision, 1);
  const filled = await updateHarumadi("owner", harumadiPdf.id, { ...settings, revision: 1, entryIds: ["mine"] });
  assert.deepEqual(filled.entryIds, ["mine"]);
  await assert.rejects(updateHarumadi("owner", harumadiPdf.id, { ...settings, revision: 1, entryIds: [] }), /다른 화면/);
  records.get("mine")!.sensitiveWithdrawnAt = new Date();
  assert.deepEqual((await readHarumadi("owner", harumadiPdf.id)).entryIds, []);
  await assert.rejects(updateHarumadi("owner", harumadiPdf.id, { ...settings, revision: 2, entryIds: ["mine"] }), /민감정보|기록/);
  assert.equal((await listHarumadis("owner", null)).harumadis.length, 1);
});
