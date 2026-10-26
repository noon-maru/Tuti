import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { initializePrivacyReplayLedger, preparePrivacyReplayReceipt, commitPrivacyReplayReceipt } from "@/server/legal/privacyReplayLedger";

process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/test";
const start = new Date("2026-10-19T00:00:00Z");
const at = (seconds: number) => new Date(start.getTime() + seconds * 1000);
let users = ["deleted", "withdrawn", "newer", "unrelated"];
let entries = [
  { id: "entry-delete", ownerId: "unrelated", image: null, publicationStatus: "private", publicId: null as string | null, publicationStatusChangedAt: at(0) },
  { id: "entry-hide", ownerId: "unrelated", image: null, publicationStatus: "published", publicId: "old-link" as string | null, publicationStatusChangedAt: at(0) },
  { id: "entry-republished", ownerId: "unrelated", image: null, publicationStatus: "published", publicId: "new-link" as string | null, publicationStatusChangedAt: at(20) },
];
let books = [{ id: "book-delete", ownerId: "unrelated", objectKey: "" }];
let notebooks = [{ id: "notebook-delete", ownerId: "unrelated" }];
const entryModel = {
  findMany: async ({ where }: { where: { id?: { gt: string }; ownerId?: string } }) => entries.filter((entry) => (!where.id || entry.id > where.id.gt) && (!where.ownerId || entry.ownerId === where.ownerId)).sort((a, b) => a.id.localeCompare(b.id)),
  findUnique: async ({ where }: { where: { id: string } }) => entries.find((entry) => entry.id === where.id) ?? null,
  delete: async ({ where }: { where: { id: string } }) => { entries = entries.filter((entry) => entry.id !== where.id); },
  updateMany: async ({ where, data }: { where: { id: string }; data: Partial<typeof entries[number]> }) => { const entry = entries.find((entry) => entry.id === where.id); if (entry) Object.assign(entry, data); return { count: entry ? 1 : 0 }; },
};
const bookModel = {
  findMany: async ({ where }: { where: { id?: { gt: string }; ownerId?: string } }) => books.filter((book) => (!where.id || book.id > where.id.gt) && (!where.ownerId || book.ownerId === where.ownerId)),
  findFirst: async ({ where }: { where: { id: string; ownerId: string } }) => books.find((book) => book.id === where.id && book.ownerId === where.ownerId) ?? null,
  delete: async ({ where }: { where: { id: string } }) => { books = books.filter((book) => book.id !== where.id); },
};
const deleted: string[] = [];
const withdrawals: string[] = [];
const states = new Map<string, { id: string; status: string; createdAt: Date }>([["withdrawn", { id: "old", status: "accepted", createdAt: at(0) }], ["newer", { id: "new", status: "accepted", createdAt: at(20) }]]);
const transaction = new Proxy({
  $queryRaw: async (_parts: unknown, id: string) => [{ id }],
  user: { delete: async ({ where }: { where: { id: string } }) => { users = users.filter((id) => id !== where.id); deleted.push(where.id); } },
  journalEntry: entryModel,
  locationConsentEvent: {
    findFirst: async ({ where }: { where: { userId: string } }) => states.get(where.userId) ?? null,
    deleteMany: async () => ({ count: 0 }),
    create: async ({ data }: { data: { userId: string; id: string; status: string; createdAt: Date } }) => { states.set(data.userId, data); withdrawals.push(data.userId); return data; },
  },
}, { get(target, key) { return Reflect.get(target, key) ?? { deleteMany: async () => ({ count: 0 }), updateMany: async () => ({ count: 0 }) }; } });
(globalThis as { prisma?: unknown }).prisma = {
  journalEntry: entryModel,
  journalBook: bookModel,
  journalNotebook: {
    findMany: async ({ where }: { where: { id?: { gt: string }; ownerId?: string } }) => notebooks.filter(book => (!where.id || book.id > where.id.gt) && (!where.ownerId || book.ownerId === where.ownerId)),
    findFirst: async ({ where }: { where: { id: string; ownerId: string } }) => notebooks.find(book => book.id === where.id && book.ownerId === where.ownerId) ?? null,
    deleteMany: async ({ where }: { where: { id: string; ownerId: string } }) => { const length = notebooks.length; notebooks = notebooks.filter(book => book.id !== where.id || book.ownerId !== where.ownerId); return { count: length - notebooks.length }; },
  },
  user: {
    findMany: async ({ where }: { where: { id?: { gt: string } } }) => users.filter((id) => !where.id || id > where.id.gt).sort().map((id) => ({ id })),
    findUnique: async ({ where }: { where: { id: string } }) => users.includes(where.id) ? { id: where.id, role: "user", authIdentities: [], journalEntries: [], journalBooks: [] } : null,
  },
  $transaction: async (operation: (tx: typeof transaction) => Promise<unknown>) => operation(transaction),
};
const { replayPrivacyRequests } = await import("@/server/legal/privacyReplay");
test("복원 재반영은 삭제 계정과 철회만 처리하고 새 동의·무관한 계정은 보존한다", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "tuti-privacy-replay-"));
  process.env.PRIVACY_REPLAY_LEDGER_ENABLED = "true";
  process.env.PRIVACY_REPLAY_LEDGER_PATH = directory;
  process.env.PRIVACY_REPLAY_HMAC_SECRET = "ab".repeat(32);
  t.after(async () => { await rm(directory, { recursive: true, force: true }); delete process.env.PRIVACY_REPLAY_LEDGER_ENABLED; delete process.env.PRIVACY_REPLAY_LEDGER_PATH; delete process.env.PRIVACY_REPLAY_HMAC_SECRET; });
  await initializePrivacyReplayLedger(start);
  for (const id of ["deleted", "withdrawn", "newer"]) {
    const receipt = await preparePrivacyReplayReceipt(id === "deleted" ? "account_deleted" : "location_withdrawn", id, at(1));
    await commitPrivacyReplayReceipt(receipt, at(10));
  }
  const dryRun = await replayPrivacyRequests(at(100));
  assert.deepEqual(dryRun, { dryRun: true, scanned: 4, accounts: 1, withdrawals: 1, newerConsent: 1, entries: 0, books: 0, unpublished: 0, objects: 0 });
  assert.deepEqual(deleted, []);
  assert.deepEqual(withdrawals, []);
  const applied = await replayPrivacyRequests(at(100), true);
  assert.equal(applied.accounts, 1);
  assert.deepEqual(deleted, ["deleted"]);
  assert.deepEqual(withdrawals, ["withdrawn"]);
  assert.equal(states.get("newer")?.status, "accepted");
  assert.ok(users.includes("unrelated"));
  await replayPrivacyRequests(at(100), true);
  assert.deepEqual(deleted, ["deleted"]);
  assert.deepEqual(withdrawals, ["withdrawn"]);
  for (const [kind, id] of [["journal_deleted", "entry-delete"], ["journal_unpublished", "entry-hide"], ["journal_unpublished", "entry-republished"], ["journal_book_deleted", "book-delete"]] as const) {
    const receipt = await preparePrivacyReplayReceipt(kind, "unrelated", at(1), id);
    await commitPrivacyReplayReceipt(receipt, at(10));
  }
  const targets = await replayPrivacyRequests(at(100), true);
  assert.equal(targets.entries, 1);
  assert.equal(targets.books, 1);
  assert.equal(targets.unpublished, 1);
  assert.equal(entries.some((entry) => entry.id === "entry-delete"), false);
  assert.equal(books.length, 0);
  assert.equal(entries.find((entry) => entry.id === "entry-hide")?.publicId, null);
  assert.equal(entries.find((entry) => entry.id === "entry-republished")?.publicId, "new-link");
  assert.equal(notebooks.length, 1);
  const notebookReceipt = await preparePrivacyReplayReceipt("journal_book_deleted", "unrelated", at(1), "notebook-delete");
  await commitPrivacyReplayReceipt(notebookReceipt, at(10));
  const notebookReplay = await replayPrivacyRequests(at(100), true);
  assert.equal(notebookReplay.books, 1);
  assert.equal(notebooks.length, 0);
});
