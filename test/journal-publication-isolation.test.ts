import assert from "node:assert/strict";
import test from "node:test";

test("공개 쓰기는 최신 관리자 숨김과 계정 제한을 잠금 안에서 다시 확인한다", async t => {
  const globals = globalThis as unknown as { prisma?: unknown };
  const previous = globals.prisma;
  const envKeys = ["SENSITIVE_JOURNAL_WORKFLOW_ENABLED", "PRIVACY_REPLAY_LEDGER_ENABLED"];
  const old = envKeys.map(key => process.env[key]); envKeys.forEach(key => { process.env[key] = "false"; });
  let status = "private", restricted = false, locked = false, changed = 0, logs = 0;
  let race: "hide" | "restrict" | "none" = "hide";
  const entry = () => ({ id: "entry", ownerId: "owner", title: "title", content: "content", placeName: "", image: null,
    publicId: null, publishedAt: null, publicationStatus: status, updatedAt: new Date(), visitedAt: new Date(), publicationStatusChangedAt: new Date(), sensitiveContent: false, sensitiveWithdrawnAt: null });
  const db = {
    $queryRaw: async () => { locked = true; return [{ id: "entry" }]; },
    journalEntry: { findFirst: async () => entry(), findUniqueOrThrow: async () => entry(), updateMany: async () => { assert.ok(locked); changed++; return { count: 1 }; } },
    user: { findUnique: async () => ({ journalPublicationRestrictedAt: restricted ? new Date() : null }) },
    systemLog: { create: async () => { logs++; } },
    $transaction: async (work: (tx: unknown) => Promise<unknown>) => {
      if (race === "hide") status = "hidden";
      if (race === "restrict") restricted = true;
      return work(db);
    },
  };
  globals.prisma = db;
  t.after(() => { globals.prisma = previous; envKeys.forEach((key, i) => { if (old[i] === undefined) delete process.env[key]; else process.env[key] = old[i]; }); });
  const { setJournalEntryPublication } = await import("../src/server/journal/service");
  const { getJournalPublicationPolicyVersion } = await import("../src/shared/legal/journalPublicationPolicy");
  const publish = () => setJournalEntryPublication("owner", "entry", true, getJournalPublicationPolicyVersion());
  await assert.rejects(publish(), /숨긴/);
  assert.equal(changed, 0);
  status = "private"; race = "restrict";
  await assert.rejects(publish(), /공개할 수 없어요/);
  assert.equal(changed, 0);
  restricted = false; race = "none";
  await publish(); assert.equal(changed, 1); assert.equal(logs, 1);
});
