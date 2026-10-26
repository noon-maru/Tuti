import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { emptyHarumadiPdfDraft } from "../src/shared/api/harumadiPdf";
import { createHarumadiPdfDraftStorage } from "../src/lib/harumadiPdfDraft";
import { harumadiPdfObjectKey, isStoredHarumadiPdf } from "../src/server/harumadi/pdfStorage";
import { LEGACY_HARUMADI_DRAFT_PREFIX, LEGACY_HARUMADI_PDF_PREFIX, LEGACY_HARUMADI_DELETION_KIND, LEGACY_HARUMADI_ACTIVITY_PREFIX, LEGACY_HARUMADI_PURCHASE_SURFACE } from "../src/shared/harumadi/legacy";
import { requiresServiceTerms } from "../src/shared/legal/serviceTerms";
import { normalizeProductInteraction } from "../src/shared/api/productInteraction";
import { normalizeProductActivityInput } from "../src/shared/api/productActivity";
import { INTERIM_HARUMADI_DRAFT_PREFIX, INTERIM_HARUMADI_PDF_PREFIX, INTERIM_HARUMADI_DELETION_KIND } from "../src/shared/harumadi/legacy";

test("임시 명칭으로 남은 초안·PDF·계측도 하루마디로 이어진다", async () => {
  assert.equal(isStoredHarumadiPdf(`${INTERIM_HARUMADI_PDF_PREFIX}owner/pdf.pdf`), true);
  const draft = { ...emptyHarumadiPdfDraft(), title: "임시 명칭 초안" };
  const values = new Map([[`${INTERIM_HARUMADI_DRAFT_PREFIX}owner`, JSON.stringify(draft)]]);
  const storage = createHarumadiPdfDraftStorage({ getItem: async key => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value); }, removeItem: async key => { values.delete(key); } });
  assert.deepEqual(await storage.loadHarumadiPdfDraft("owner"), draft);
  assert.equal(values.has(`${INTERIM_HARUMADI_DRAFT_PREFIX}owner`), false);
  const eventId = "11111111-1111-4111-8111-111111111111";
  assert.equal(normalizeProductActivityInput({ clientSessionId: eventId, action: "harugalpi_saved", platform: "web" })?.action, "harumadi_saved");
  assert.equal(normalizeProductInteraction({ eventId, action: "harugalpi_purchase_clicked", surface: "completed_harugalpi", platform: "web" })?.surface, "completed_harumadi");
});

test("정식 API·페이지·모델은 harumadi 이름만 사용하며 기존 경로는 등록하지 않는다", () => {
  for (const path of ["src/app/api/harumadis/route.ts", "src/app/api/harumadi-pdfs/route.ts", "src/app/(tuti)/(main)/harumadi/page.tsx", "src/app/(tuti)/(main)/harumadi/pdfs/page.tsx"]) assert.equal(existsSync(path), true);
  for (const path of ["src/app/api/journal-books/route.ts", "src/app/api/journal-notebooks/route.ts", "src/app/(tuti)/(main)/journal/book/page.tsx", "src/app/api/harugalpis/route.ts", "src/app/api/harugalpi-pdfs/route.ts", "src/app/(tuti)/(main)/harugalpi/page.tsx"]) assert.equal(existsSync(path), false);
  for (const path of ["/api/harumadis", "/api/harumadis/id", "/api/harumadi-pdfs", "/api/harumadi-pdfs/preview"]) assert.equal(requiresServiceTerms(path, "POST"), true);
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  assert.match(schema, /model Harumadi \{/);
  assert.match(schema, /model HarumadiPdf \{/);
  assert.doesNotMatch(schema, /JournalBook|JournalNotebook|journal_books|journal_notebooks|Harugalpi|harugalpi/);
  const migration = readFileSync("prisma/migrations/20261026170000_rename_harumadi/migration.sql", "utf8");
  assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE|DELETE FROM/i);
  assert.match(migration, /RENAME TO harumadi_pdfs/);
  const merge = readFileSync("src/server/auth/accountMerge.ts", "utf8");
  assert.match(merge, /transaction\.harumadi\.updateMany\(\{\s*where: \{ ownerId: sourceUserId \},\s*data: \{ ownerId: targetUserId \}/);
});

test("PDF는 새 경로에 저장하되 이전 객체 참조도 읽고 삭제할 수 있다", () => {
  assert.equal(harumadiPdfObjectKey("owner", "pdf"), "harumadi-pdfs/owner/pdf.pdf");
  assert.equal(isStoredHarumadiPdf("harumadi-pdfs/owner/pdf.pdf"), true);
  assert.equal(isStoredHarumadiPdf(`${LEGACY_HARUMADI_PDF_PREFIX}owner/pdf.pdf`), true);
  assert.equal(isStoredHarumadiPdf("public/owner/pdf.pdf"), false);
});

test("기기 초안은 계정별로 이전하고 삭제 시 두 이름 모두 정리한다", async () => {
  const draft = { ...emptyHarumadiPdfDraft(), title: "남겨둔 초안" };
  const values = new Map([[`${LEGACY_HARUMADI_DRAFT_PREFIX}a`, JSON.stringify(draft)], [`${LEGACY_HARUMADI_DRAFT_PREFIX}b`, JSON.stringify(draft)]]);
  const storage = createHarumadiPdfDraftStorage({ getItem: async key => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value); }, removeItem: async key => { values.delete(key); } });
  assert.deepEqual(await storage.loadHarumadiPdfDraft("a"), draft);
  assert.equal(values.has("tuti-harumadi-pdf-v1:a"), true);
  assert.equal(values.has(`${LEGACY_HARUMADI_DRAFT_PREFIX}a`), false);
  assert.equal(values.has(`${LEGACY_HARUMADI_DRAFT_PREFIX}b`), true);
  values.set(`${LEGACY_HARUMADI_DRAFT_PREFIX}a`, JSON.stringify(draft));
  await storage.removeHarumadiPdfDraft("a");
  assert.equal(await storage.loadHarumadiPdfDraft("a"), null);
  assert.equal(values.has(`${LEGACY_HARUMADI_DRAFT_PREFIX}a`), false);
});

test("초안 이름 이전 중 삭제·새 저장이 발생해도 과거 내용이 되살아나지 않는다", async () => {
  for (const operation of ["delete", "save"] as const) {
    const old = { ...emptyHarumadiPdfDraft(), title: "이전" };
    const recent = { ...old, title: "새 저장" };
    const values = new Map<string, string>();
    let entered!: () => void; const reading = new Promise<void>(resolve => { entered = resolve; });
    let release!: () => void; const waiting = new Promise<void>(resolve => { release = resolve; });
    const storage = createHarumadiPdfDraftStorage({
      getItem: async key => { if (key === `${LEGACY_HARUMADI_DRAFT_PREFIX}a`) { entered(); await waiting; return JSON.stringify(old); } return values.get(key) ?? null; },
      setItem: async (key, value) => { values.set(key, value); }, removeItem: async key => { values.delete(key); },
    });
    const pending = storage.loadHarumadiPdfDraft("a"); await reading;
    if (operation === "delete") await storage.removeHarumadiPdfDraft("a"); else await storage.saveHarumadiPdfDraft("a", recent);
    release();
    assert.deepEqual(await pending, operation === "delete" ? null : recent);
  }
});

test("이전 계측 입력은 새 이름으로 정규화해 재전송하며 집계 이벤트는 유지한다", () => {
  const eventId = "11111111-1111-4111-8111-111111111111";
  assert.equal(normalizeProductActivityInput({ clientSessionId: eventId, action: `${LEGACY_HARUMADI_ACTIVITY_PREFIX}saved`, platform: "web" })?.action, "harumadi_saved");
  const interaction = normalizeProductInteraction({ eventId, action: `${LEGACY_HARUMADI_ACTIVITY_PREFIX}purchase_clicked`, surface: LEGACY_HARUMADI_PURCHASE_SURFACE, platform: "web" });
  assert.equal(interaction?.action, "harumadi_purchase_clicked");
  assert.equal(interaction?.surface, "completed_harumadi");
});

test("기존 서명 원장과 새 원장 모두 올바른 하루마디·PDF 객체만 재파기한다", async t => {
  const directory = await mkdtemp(join(tmpdir(), "tuti-harumadi-legacy-"));
  const names = ["PRIVACY_REPLAY_LEDGER_ENABLED", "PRIVACY_REPLAY_LEDGER_PATH", "PRIVACY_REPLAY_HMAC_SECRET"] as const;
  const previous = names.map(name => process.env[name]);
  process.env.PRIVACY_REPLAY_LEDGER_ENABLED = "true";
  process.env.PRIVACY_REPLAY_LEDGER_PATH = directory;
  process.env.PRIVACY_REPLAY_HMAC_SECRET = "ab".repeat(32);
  t.after(async () => { await rm(directory, { recursive: true, force: true }); names.forEach((name, i) => { if (previous[i] === undefined) delete process.env[name]; else process.env[name] = previous[i]; }); });
  const ledger = await import("../src/server/legal/privacyReplayLedger");
  const { privacyReplayObjectSelector } = await import("../src/server/legal/privacyReplayObjects");
  await ledger.initializePrivacyReplayLedger();
  const old = await ledger.preparePrivacyReplayReceipt(LEGACY_HARUMADI_DELETION_KIND, "owner", new Date(), "old-id"); assert.ok(old);
  await ledger.commitPrivacyReplayReceipt(old);
  const current = await ledger.preparePrivacyReplayReceipt("harumadi_deleted", "owner", new Date(), "new-id"); assert.ok(current);
  await ledger.commitPrivacyReplayReceipt(current);
  const interim = await ledger.preparePrivacyReplayReceipt(INTERIM_HARUMADI_DELETION_KIND, "owner", new Date(), "interim-id"); assert.ok(interim);
  await ledger.commitPrivacyReplayReceipt(interim);
  const interimBytes = await readFile(join(directory, `${interim.id}.json`), "utf8");
  const originalBytes = await readFile(join(directory, `${old.id}.json`), "utf8");
  const snapshot = await ledger.readPrivacyReplaySnapshot();
  assert.equal(snapshot.unresolved, 0); assert.equal(snapshot.committed.length, 3);
  assert.equal(await readFile(join(directory, `${interim.id}.json`), "utf8"), interimBytes);
  assert.equal(ledger.matchesHarumadiReplayTarget(snapshot.committed.find(record => record.id === interim.id)!, "interim-id"), true);
  assert.equal(await readFile(join(directory, `${old.id}.json`), "utf8"), originalBytes);
  const storedOld = snapshot.committed.find(record => record.id === old.id)!;
  assert.equal(storedOld.kind, LEGACY_HARUMADI_DELETION_KIND);
  assert.equal(ledger.matchesHarumadiReplayTarget(storedOld, "old-id"), true);
  const selected = privacyReplayObjectSelector(snapshot);
  for (const prefix of [LEGACY_HARUMADI_PDF_PREFIX, INTERIM_HARUMADI_PDF_PREFIX, "harumadi-pdfs/"]) {
    assert.equal(selected(`${prefix}owner/interim-id.pdf`), true);
    assert.equal(selected(`${prefix}owner/old-id.pdf`), true);
    assert.equal(selected(`${prefix}owner/new-id.pdf`), true);
    assert.equal(selected(`${prefix}other/old-id.pdf`), false);
    assert.equal(selected(`${prefix}owner/keep.pdf`), false);
  }
});
