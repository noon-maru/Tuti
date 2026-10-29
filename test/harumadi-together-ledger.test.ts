import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TOGETHER_REPLAY_KINDS, initializePrivacyReplayLedger, preparePrivacyReplayReceipt, commitPrivacyReplayReceipt, readPrivacyReplaySnapshot, privacyReplayTarget } from "@/server/legal/privacyReplayLedger";

test("함께 채우기의 모든 철회 종류를 실제 서명 원장에 저장하고 원문 없이 다시 검증한다", async t => {
  const directory = await mkdtemp(join(tmpdir(), "tuti-together-ledger-"));
  process.env.PRIVACY_REPLAY_LEDGER_ENABLED = "true";
  process.env.PRIVACY_REPLAY_LEDGER_PATH = directory;
  process.env.PRIVACY_REPLAY_HMAC_SECRET = "cd".repeat(32);
  t.after(async () => { await rm(directory, { recursive: true, force: true }); delete process.env.PRIVACY_REPLAY_LEDGER_ENABLED; delete process.env.PRIVACY_REPLAY_LEDGER_PATH; delete process.env.PRIVACY_REPLAY_HMAC_SECRET; });
  await initializePrivacyReplayLedger();
  for (const kind of TOGETHER_REPLAY_KINDS) {
    const receipt = await preparePrivacyReplayReceipt(kind, "author", new Date(), "target-generation");
    assert.equal(receipt?.target, privacyReplayTarget("harumadi", "target-generation"));
    await commitPrivacyReplayReceipt(receipt);
  }
  const snapshot = await readPrivacyReplaySnapshot();
  assert.equal(snapshot.unresolved, 0);
  assert.equal(snapshot.committed.length, TOGETHER_REPLAY_KINDS.length);
  assert.doesNotMatch(JSON.stringify(snapshot), /target-generation|"author"/);
  await assert.rejects(preparePrivacyReplayReceipt("harumadi_member_left", "author"));
  await preparePrivacyReplayReceipt("harumadi_user_blocked", "other-author", new Date(), "other-target");
  const unblocked = await preparePrivacyReplayReceipt("harumadi_user_unblocked", "other-author", new Date(), "other-target");
  await commitPrivacyReplayReceipt(unblocked);
  assert.equal((await readPrivacyReplaySnapshot()).unresolved, 0, "나중에 확정한 차단 해제는 이전 미완료 차단 요청을 대체한다");
});
