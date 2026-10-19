import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { initializePrivacyReplayLedger, preparePrivacyReplayReceipt, commitPrivacyReplayReceipt, readPrivacyReplaySnapshot, privacyReplaySubject, verifyPrivacyReplayCoverage, prunePrivacyReplayLedger } from "@/server/legal/privacyReplayLedger";

const start = new Date("2026-10-19T00:00:00Z");
const after = (seconds: number) => new Date(start.getTime() + seconds * 1000);
async function fixture(t: test.TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "tuti-privacy-ledger-"));
  const old = { path: process.env.PRIVACY_REPLAY_LEDGER_PATH, secret: process.env.PRIVACY_REPLAY_HMAC_SECRET, enabled: process.env.PRIVACY_REPLAY_LEDGER_ENABLED };
  process.env.PRIVACY_REPLAY_LEDGER_PATH = directory;
  process.env.PRIVACY_REPLAY_HMAC_SECRET = "ab".repeat(32);
  process.env.PRIVACY_REPLAY_LEDGER_ENABLED = "true";
  t.after(async () => {
    for (const [key, value] of Object.entries({ PRIVACY_REPLAY_LEDGER_PATH: old.path, PRIVACY_REPLAY_HMAC_SECRET: old.secret, PRIVACY_REPLAY_LEDGER_ENABLED: old.enabled })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}
test("복원 방지 원장은 비활성 시 파일을 생성하거나 설정을 요구하지 않는다", async (t) => {
  await fixture(t);
  process.env.PRIVACY_REPLAY_LEDGER_ENABLED = "false";
  delete process.env.PRIVACY_REPLAY_HMAC_SECRET;
  assert.equal(await preparePrivacyReplayReceipt("account_deleted", "private-user"), null);
});
test("초기화 전에는 처리하지 않고 서명된 원장에는 원문 사용자 ID를 저장하지 않는다", async (t) => {
  const directory = await fixture(t);
  await assert.rejects(preparePrivacyReplayReceipt("account_deleted", "private-user"));
  await initializePrivacyReplayLedger(start);
  const receipt = await preparePrivacyReplayReceipt("account_deleted", "private-user", after(1));
  await commitPrivacyReplayReceipt(receipt, after(2));
  const snapshot = await readPrivacyReplaySnapshot();
  assert.equal(snapshot.committed.length, 1);
  assert.equal(snapshot.unresolved, 0);
  assert.equal(snapshot.committed[0].subject, privacyReplaySubject("private-user"));
  for (const name of await readdir(directory)) assert.doesNotMatch(await readFile(join(directory, name), "utf8"), /private-user/);
  assert.doesNotThrow(() => verifyPrivacyReplayCoverage(snapshot, after(5)));
  const again = await initializePrivacyReplayLedger(after(100));
  assert.equal(again.coverageStart, start.toISOString());
});
test("미완료 요청은 자동 재개를 막고 같은 사용자의 후속 완료 요청만 이를 대체한다", async (t) => {
  await fixture(t);
  await initializePrivacyReplayLedger(start);
  await preparePrivacyReplayReceipt("location_withdrawn", "first", after(1));
  const other = await preparePrivacyReplayReceipt("location_withdrawn", "second", after(2));
  await commitPrivacyReplayReceipt(other, after(3));
  assert.equal((await readPrivacyReplaySnapshot()).unresolved, 1);
  assert.throws(() => verifyPrivacyReplayCoverage({ coverageStart: start, committed: [], unresolved: 1 }, after(5), "REVIEW-123"));
  const retry = await preparePrivacyReplayReceipt("location_withdrawn", "first", after(4));
  await commitPrivacyReplayReceipt(retry, after(5));
  assert.equal((await readPrivacyReplaySnapshot()).unresolved, 0);
});
test("다른 기록의 삭제 완료를 같은 사용자의 미완료 삭제 근거로 재사용하지 않는다", async (t) => {
  await fixture(t);
  await initializePrivacyReplayLedger(start);
  await preparePrivacyReplayReceipt("journal_deleted", "owner", after(1), "first");
  const receipt = await preparePrivacyReplayReceipt("journal_deleted", "owner", after(2), "second");
  await commitPrivacyReplayReceipt(receipt, after(3));
  assert.equal((await readPrivacyReplaySnapshot()).unresolved, 1);
});
test("서명 변조·키 교체·전체 기록 누락은 성공한 원장으로 취급하지 않는다", async (t) => {
  const directory = await fixture(t);
  await initializePrivacyReplayLedger(start);
  const receipt = await preparePrivacyReplayReceipt("account_deleted", "first", after(1));
  await commitPrivacyReplayReceipt(receipt, after(2));
  process.env.PRIVACY_REPLAY_HMAC_SECRET = "cd".repeat(32);
  await assert.rejects(readPrivacyReplaySnapshot());
  process.env.PRIVACY_REPLAY_HMAC_SECRET = "ab".repeat(32);
  const path = join(directory, `${receipt!.id}.json`);
  const original = await readFile(path, "utf8");
  await writeFile(path, original.replace("committed", "prepared"));
  await assert.rejects(readPrivacyReplaySnapshot());
  await writeFile(path, original);
  await rm(path);
  await assert.rejects(readPrivacyReplaySnapshot(), /누락/);
});
test("권한이 넓은 원장은 거부하고 수집 이전 백업은 별도 검토 없이는 재개하지 않는다", async (t) => {
  const directory = await fixture(t);
  await initializePrivacyReplayLedger(start);
  const snapshot = await readPrivacyReplaySnapshot();
  assert.throws(() => verifyPrivacyReplayCoverage(snapshot, after(-1)));
  assert.doesNotThrow(() => verifyPrivacyReplayCoverage(snapshot, after(-1), "LEGACY-REVIEW-1"));
  await chmod(directory, 0o755);
  await assert.rejects(readPrivacyReplaySnapshot(), /0700/);
  await chmod(directory, 0o700);
});
test("동시 기록도 파일 목록을 잃지 않고 모두 포함한다", async (t) => {
  await fixture(t);
  await initializePrivacyReplayLedger(start);
  const receipts = await Promise.all(Array.from({ length: 6 }, (_, index) => preparePrivacyReplayReceipt("account_deleted", `subject-${index}`, after(1))));
  await Promise.all(receipts.map((receipt) => commitPrivacyReplayReceipt(receipt, after(2))));
  assert.equal((await readPrivacyReplaySnapshot()).committed.length, 6);
});
test("만료 백업 범위의 완료 원장만 파기하고 미완료 요청과 최근 요청은 유지한다", async (t) => {
  await fixture(t);
  const old = new Date(Date.now() - 40 * 86400000);
  const cutoff = new Date(Date.now() - 30 * 86400000 - 1000);
  await initializePrivacyReplayLedger(old);
  const completed = await preparePrivacyReplayReceipt("account_deleted", "old-completed", old);
  await commitPrivacyReplayReceipt(completed, old);
  await preparePrivacyReplayReceipt("location_withdrawn", "old-pending", old);
  const recent = await preparePrivacyReplayReceipt("account_deleted", "recent");
  await commitPrivacyReplayReceipt(recent);
  assert.equal((await prunePrivacyReplayLedger(cutoff)).deleted, 1);
  const snapshot = await readPrivacyReplaySnapshot();
  assert.equal(snapshot.committed.length, 1);
  assert.equal(snapshot.unresolved, 1);
  assert.equal(snapshot.coverageStart.toISOString(), cutoff.toISOString());
});
