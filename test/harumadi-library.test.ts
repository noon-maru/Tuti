import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import sharp from "sharp";
import { preferencesStorage } from "../src/lib/storage/preferencesStorage";
import { markLibraryEntryCompleted, readLibraryEntryCompleted } from "../src/lib/libraryPreferences";

test("책장 도달 이력은 계정별로 분리하고 메모리에서도 유지한다", async t => {
  const values = new Map<string, string>();
  t.mock.method(preferencesStorage, "getItem", async (key: string) => values.get(key) ?? null);
  t.mock.method(preferencesStorage, "setItem", async (key: string, value: string) => { values.set(key, value); });
  assert.equal(await readLibraryEntryCompleted("a"), false);
  await markLibraryEntryCompleted("a");
  assert.equal(await readLibraryEntryCompleted("a"), true);
  assert.equal(await readLibraryEntryCompleted("b"), false);
  t.mock.method(preferencesStorage, "getItem", async () => { throw new Error("unavailable"); });
  assert.equal(await readLibraryEntryCompleted("a"), true);
});

test("홈은 탐색을 마운트하지 않고 페이지네이션·소유자별 캐시·작은 표지만 사용한다", () => {
  const main = readFileSync("src/features/tuti/flows/MainFlow.tsx", "utf8");
  const home = readFileSync("src/features/tuti/flows/LibraryHomeFlow.tsx", "utf8");
  assert.doesNotMatch(main, /RecommendationsFlow|router\.replace/);
  assert.doesNotMatch(home, /useTutiRecommendations|requestLocation|HarumadiPdfPreview/);
  assert.match(home, /\["library-harumadis", ownerId\]/);
  assert.match(home, /getNextPageParam/);
  assert.match(home, /<MainNavigation active="harumadi"/);
  assert.match(readFileSync("src/app/(tuti)/(main)/page.tsx", "utf8"), /<LibraryHomeFlow/);
  assert.match(readFileSync("src/features/tuti/components/HarumadiCover.tsx", "utf8"), /URL\.revokeObjectURL/);
});

test("둘러보기 후 빈 홈은 기본 표지 대신 첫 마디 작성을 안내하고 실제 하루마디는 유지한다", () => {
  const home = readFileSync("src/features/tuti/flows/LibraryHomeFlow.tsx", "utf8");
  const entry = readFileSync("src/features/tuti/flows/EntryFlow.tsx", "utf8");
  assert.doesNotMatch(home, /EmptyHarumadi|기억하고 싶은 하루<\/i>|createHarumadi\(/);
  assert.match(home, /const isFirstMadi = query.isSuccess && recordCount === 0/);
  assert.match(home, /firstMadi=\{isFirstMadi\}/);
  const navigation = readFileSync("src/features/tuti/components/MainNavigation.tsx", "utf8");
  assert.match(navigation, /firstMadi \? "첫 마디 남기기" : "마디 남기기"/);
  assert.match(navigation, /`\/madi\/new\?from=\$\{active === "harumadi" \? "library" : "explore"\}`/);
  assert.match(home, /새 하루마디<\/TextAction>/);
  assert.match(home, /harumadiPdfs.slice\(row \* 2, row \* 2 \+ 2\).map/);
  assert.match(entry, /onExplore=\{\(\) => \{[\s\S]*?router.replace\("\/explore"\)/);
  assert.doesNotMatch(entry, /createHarumadi\(/);
});

test("가판대는 표지를 중심으로 두고 생성·보관함 동선을 중복하지 않는다", () => {
  const home = readFileSync("src/features/tuti/flows/LibraryHomeFlow.tsx", "utf8");
  assert.match(home, /<Header><h1 id="library-title">나의 하루마디<\/h1>/);
  assert.match(home, /<LibraryLinks aria-label="마디와 PDF 보관함">/);
  assert.match(home, /router.push\("\/madi"\)/);
  assert.match(home, /router.push\("\/harumadi\/pdfs"\)/);
  assert.doesNotMatch(home, /<Heading>|<CreateHarumadi|<ArchiveButton/);
  assert.match(home, /prefers-reduced-motion: reduce/);
});

test("하루마디 목록과 표지는 소유권·민감정보 철회·크기 한도를 지킨다", async t => {
  (globalThis as { prisma?: unknown }).prisma = {
    user: { findUnique: async () => null },
    journalEntry: { findMany: async () => [], count: async () => 0 },
    harumadiPdf: { findFirst: async () => null, findMany: async () => [], updateMany: async () => ({ count: 0 }) },
    $transaction: async () => null,
  };
  const { prisma } = await import("../src/server/db/prisma");
  const { GET: list } = await import("../src/app/api/harumadi-pdfs/route");
  const { GET: cover, POST: saveCover } = await import("../src/app/api/harumadi-pdfs/[harumadiPdfId]/cover/route");
  const { GET: metadata } = await import("../src/app/api/harumadi-pdfs/[harumadiPdfId]/route");
  const previous = process.env.SERVICE_TERMS_ENFORCEMENT_ENABLED;
  process.env.SERVICE_TERMS_ENFORCEMENT_ENABLED = "false";
  t.after(() => { if (previous === undefined) delete process.env.SERVICE_TERMS_ENFORCEMENT_ENABLED; else process.env.SERVICE_TERMS_ENFORCEMENT_ENABLED = previous; });
  const request = (path: string, init?: RequestInit) => new Request(`https://tuti.test/api/harumadi-pdfs${path}`, { ...init, headers: { Authorization: `Bearer ${"a".repeat(40)}`, ...init?.headers } });
  const context = { params: Promise.resolve({ harumadiPdfId: "harumadiPdf-a" }) };
  const jpeg = await sharp({ create: { width: 12, height: 16, channels: 3, background: "white" } }).jpeg().toBuffer();
  const harumadiPdf = { id: "harumadiPdf-a", title: "한 권", entryIds: ["entry-a"], pageCount: 3, createdAt: new Date(), coverStyle: "green-plain", coverReady: false, sensitivePolicyVersion: null };
  let owned = true; let withdrawn = false; let updated = 0;
  t.mock.method(prisma.user, "findUnique", async () => ({ id: "owner-a", role: "user", displayName: null, lastAccessedAt: new Date(), authIdentities: [] }));
  t.mock.method(prisma.journalEntry, "findMany", async () => []);
  t.mock.method(prisma.journalEntry, "count", async () => withdrawn ? 1 : 0);
  t.mock.method(prisma.harumadiPdf, "findFirst", async (args: { where: { ownerId: string }; select: { coverThumbnail?: boolean } }) => {
    assert.equal(args.where.ownerId, "owner-a");
    return owned ? args.select.coverThumbnail ? { coverThumbnail: jpeg } : harumadiPdf : null;
  });
  t.mock.method(prisma.harumadiPdf, "findMany", async (args: { where: { ownerId: string }; select: object; take: number }) => {
    assert.equal(args.where.ownerId, "owner-a");
    assert.equal("coverThumbnail" in args.select, false);
    assert.equal(args.take, 2);
    return [harumadiPdf, { ...harumadiPdf, id: "harumadiPdf-b" }];
  });
  t.mock.method(prisma.harumadiPdf, "updateMany", async () => { updated++; return { count: 1 }; });
  t.mock.method(prisma, "$transaction", async (fn: (tx: unknown) => unknown) => fn({ ...prisma, $queryRaw: async () => [] }));
  assert.equal((await list(new Request("https://tuti.test/api/harumadi-pdfs"))).status, 401);
  const page = await list(request("?limit=1"));
  const body = await page.json();
  assert.equal(body.harumadiPdfs.length, 1); assert.equal(body.nextCursor, "harumadiPdf-a");
  assert.equal(body.harumadiPdfs[0].coverStyle, "green-plain");
  assert.equal(page.headers.get("cache-control"), "private, no-store");
  for (const limit of ["0", "49", "1.2", "x"]) assert.equal((await list(request(`?limit=${limit}`))).status, 400);
  owned = false;
  assert.equal((await list(request("?limit=1&cursor=foreign"))).status, 400);
  assert.equal((await cover(request("/harumadiPdf-a/cover"), context)).status, 404);
  assert.equal((await metadata(request("/harumadiPdf-a"), context)).status, 404);
  owned = true; withdrawn = true;
  assert.equal((await cover(request("/harumadiPdf-a/cover"), context)).status, 410);
  withdrawn = false;
  const image = await cover(request("/harumadiPdf-a/cover"), context);
  assert.equal(image.status, 200); assert.equal(image.headers.get("content-type"), "image/jpeg");
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), jpeg);
  const save = (bytes: Uint8Array, type = "image/jpeg") => saveCover(request("/harumadiPdf-a/cover", { method: "POST", headers: { "Content-Type": type }, body: bytes.slice().buffer }), context);
  assert.equal((await save(new Uint8Array(131073))).status, 413);
  assert.equal((await save(new TextEncoder().encode("<svg/>"), "image/svg+xml")).status, 415);
  assert.equal((await save(new TextEncoder().encode("invalid"))).status, 400);
  assert.equal((await save(jpeg)).status, 200); assert.equal(updated, 1);
  harumadiPdf.coverReady = true;
  assert.equal((await save(jpeg)).status, 200); assert.equal(updated, 1);
});
