import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { developmentBooks, developmentId, developmentSeedGuard, seedDevelopment } from "../scripts/seed-development-harumadis";

test("개발 표시와 비운영 환경을 모두 확인한다", () => {
  assert.throws(() => developmentSeedGuard({ NODE_ENV: "production", TUTI_INSPECTION_ENV: "development" }));
  assert.throws(() => developmentSeedGuard({ NODE_ENV: "development" }));
  assert.doesNotThrow(() => developmentSeedGuard({ NODE_ENV: "development", TUTI_INSPECTION_ENV: "development" }));
});
test("5권·12마디·사진 8개와 빈 책·긴 글·선택 제목을 구성한다", async () => {
  const entries = developmentBooks.flatMap(b => b.entries);
  assert.equal(developmentBooks.length, 5); assert.equal(entries.length, 12);
  assert.equal(entries.filter(e => e.image !== undefined).length, 8);
  assert.equal(new Set(developmentBooks.map(b => b.coverStyle)).size, 4);
  assert.ok(developmentBooks.some(b => b.entries.length === 0));
  assert.ok(entries.some(e => !e.title && !e.content && e.image !== undefined));
  assert.ok(entries.some(e => !e.title && e.content));
  assert.ok(entries.some(e => e.content.length > 500));
  assert.equal(developmentId("a", "book:0"), developmentId("a", "book:0"));
  assert.notEqual(developmentId("a", "book:0"), developmentId("b", "book:0"));
  for (const file of ["dog-walk-example-v2.webp", "cat-at-home-example-v2.webp", "shared-afternoon-example.webp"]) {
    const image = sharp(`public/welcome/${file}`); const metadata = await image.metadata(); await image.stats();
    assert.equal(metadata.format, "webp"); assert.ok(metadata.width && metadata.height);
  }
});
function fixture() {
  let state = { books: 0, entries: 0, links: 0, receipt: false };
  let cleaned = false, uploaded = 0, reads = 0;
  const db = {
    user: { async findMany(query: unknown) { reads++; const text = JSON.stringify(query); assert.ok(text.includes("admin@tuti.today") && text.includes('"role":"admin"')); return [{ id: "admin-id" }]; } },
    systemLog: { async findUnique() { return state.receipt ? { targetId: "admin-id" } : null; }, async create() { state.receipt = true; } },
    harumadi: { async count() { return state.books; }, async create() { state.books++; } },
    journalEntry: { async count() { return state.entries; }, async create({ data }: { data: Record<string, unknown> }) { assert.equal(data.ownerId, "admin-id"); assert.equal(data.publicationStatus, "private"); state.entries++; } },
    harumadiEntryLink: { async count() { return state.links; }, async create() { state.links++; } },
    userDataCleanupJob: { async create() {}, async deleteMany() { return { count: 1 }; }, async updateMany() {} },
    async $queryRaw() {},
    async $transaction(fn: (tx: unknown) => Promise<void>) { const before = { ...state }; try { await fn(db); } catch (error) { state = before; throw error; } },
  };
  const files = { async prepare() { return { bytes: Buffer.from("fixture"), width: 300, height: 400 }; },
    async put() { uploaded++; }, async verify() {}, async clean() { cleaned = true; } };
  return { db: db as unknown as NonNullable<Parameters<typeof seedDevelopment>[1]>, files,
    failDatabase() { db.journalEntry.create = async () => { throw new Error("DB_FAILED"); }; },
    state: () => state, cleaned: () => cleaned, uploaded: () => uploaded, reads: () => reads };
}
function development(t: test.TestContext) {
  const keys = ["NODE_ENV", "TUTI_INSPECTION_ENV"];
  const before = keys.map(key => [key, process.env[key]] as const);
  for (const key of keys) process.env[key] = "development";
  t.after(() => {
    for (const [key, value] of before) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}
test("운영 환경에서는 개발 표시가 있어도 DB·파일 접근 전에 차단한다", async t => {
  development(t);
  const key: string = "NODE_ENV";
  process.env[key] = "production";
  const f = fixture();
  await assert.rejects(seedDevelopment(true, f.db, f.files), /DEVELOPMENT_ONLY/);
  assert.equal(f.reads(), 0);
  assert.equal(f.uploaded(), 0);
  assert.deepEqual(f.state(), { books: 0, entries: 0, links: 0, receipt: false });
});
test("조회는 쓰지 않고 적용은 비공개로 한 번만 추가한다", async t => {
  development(t); const f = fixture();
  assert.equal((await seedDevelopment(false, f.db, f.files)).mode, "dry-run");
  assert.equal(f.uploaded(), 0); assert.equal(f.state().books, 0);
  assert.equal((await seedDevelopment(true, f.db, f.files)).mode, "applied");
  assert.deepEqual(f.state(), { books: 5, entries: 12, links: 12, receipt: true });
  assert.equal(f.uploaded(), 8);
  assert.equal((await seedDevelopment(true, f.db, f.files)).mode, "already-present");
  assert.equal(f.uploaded(), 8);
  f.state().entries--;
  await assert.rejects(seedDevelopment(true, f.db, f.files), /PARTIAL_SEED_DO_NOT_OVERWRITE/);
});
test("이미지 업로드 실패와 DB 연결 실패는 새 자료를 남기지 않고 정리 예약을 처리한다", async t => {
  development(t);
  for (const failure of ["upload", "database"]) {
    const f = fixture();
    if (failure === "upload") f.files.put = async () => { throw new Error("UPLOAD_FAILED"); };
    else f.failDatabase();
    await assert.rejects(seedDevelopment(true, f.db, f.files));
    assert.deepEqual(f.state(), { books: 0, entries: 0, links: 0, receipt: false });
    assert.equal(f.cleaned(), true);
  }
});
