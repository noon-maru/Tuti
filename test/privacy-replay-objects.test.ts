import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { initializePrivacyReplayLedger, preparePrivacyReplayReceipt, commitPrivacyReplayReceipt, readPrivacyReplaySnapshot } from "@/server/legal/privacyReplayLedger";
import { privacyReplayObjectSelector, cleanupPrivacyReplayObjects } from "@/server/legal/privacyReplayObjects";

test("객체 정리는 삭제 원장의 정확한 계정·대상만 골라 공유 버킷의 다른 자료를 보존한다", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "tuti-privacy-objects-"));
  process.env.PRIVACY_REPLAY_LEDGER_ENABLED = "true";
  process.env.PRIVACY_REPLAY_LEDGER_PATH = directory;
  process.env.PRIVACY_REPLAY_HMAC_SECRET = "ab".repeat(32);
  process.env.OBJECT_STORAGE_ENABLED = "true";
  t.after(async () => { await rm(directory, { recursive: true, force: true }); for (const name of ["PRIVACY_REPLAY_LEDGER_ENABLED", "PRIVACY_REPLAY_LEDGER_PATH", "PRIVACY_REPLAY_HMAC_SECRET", "OBJECT_STORAGE_ENABLED"]) delete process.env[name]; });
  await initializePrivacyReplayLedger();
  const entry = await preparePrivacyReplayReceipt("journal_deleted", "owner", new Date(), "entry");
  await commitPrivacyReplayReceipt(entry);
  const deletedAccount = await preparePrivacyReplayReceipt("account_deleted", "deleted-owner");
  await commitPrivacyReplayReceipt(deletedAccount);
  const snapshot = await readPrivacyReplaySnapshot();
  const matches = privacyReplayObjectSelector(snapshot);
  assert.equal(matches("journal-images/owner/entry/photo.webp"), true);
  assert.equal(matches("journal-images/owner/another/photo.webp"), false);
  assert.equal(matches("journal-images/another/entry/photo.webp"), false);
  assert.equal(matches("harumadi-pdfs/owner/entry.pdf"), false);
  assert.equal(matches("harumadi-pdfs/deleted-owner/harumadiPdf.pdf"), true);
  assert.equal(matches("public-images/owner/entry/photo.webp"), false);
  assert.equal(matches("journal-images/owner/../photo.webp"), false);
  const deleted: string[] = [];
  const storage = {
    listObjects: async () => ({ objects: [{ key: "journal-images/owner/entry/photo.webp", size: 1 }, { key: "journal-images/other/entry/photo.webp", size: 1 }], nextContinuationToken: undefined }),
    deleteObject: async (key: string) => { deleted.push(key); },
  };
  assert.deepEqual(await cleanupPrivacyReplayObjects(false, storage, snapshot), { candidates: 1, deleted: 0 });
  assert.deepEqual(deleted, []);
  assert.deepEqual(await cleanupPrivacyReplayObjects(true, storage, snapshot), { candidates: 1, deleted: 1 });
  assert.deepEqual(deleted, ["journal-images/owner/entry/photo.webp"]);
});
test("대상 없는 개별 삭제 원장은 생성하지 않는다", async () => {
  process.env.PRIVACY_REPLAY_LEDGER_ENABLED = "true";
  await assert.rejects(preparePrivacyReplayReceipt("journal_deleted", "owner"));
  delete process.env.PRIVACY_REPLAY_LEDGER_ENABLED;
});
