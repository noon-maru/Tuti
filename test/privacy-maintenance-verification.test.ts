import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("민감정보 철회는 파일 실패에도 원문·공개를 차단하고 재시도로 해당 기록과 연관 PDF만 지운다", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "tuti-sensitive-verification-"));
  const values = { DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused", PRIVACY_REPLAY_LEDGER_ENABLED: "true",
    PRIVACY_REPLAY_LEDGER_PATH: directory, PRIVACY_REPLAY_HMAC_SECRET: "cd".repeat(32), OBJECT_STORAGE_ENABLED: "true",
    OBJECT_STORAGE_ENDPOINT: "http://127.0.0.1:1", OBJECT_STORAGE_REGION: "test", OBJECT_STORAGE_BUCKET: "test",
    OBJECT_STORAGE_ACCESS_KEY_ID: "test", OBJECT_STORAGE_SECRET_ACCESS_KEY: "test" };
  const previous = new Map(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  const state = { id: "sensitive", ownerId: "owner", sensitiveContent: true, sensitiveWithdrawnAt: null as Date | null,
    title: "private-title", content: "private-body", publicId: "public-link", publicationStatus: "published", image: "journal-images/owner/sensitive/photo.webp" };
  let present = true;
  const harumadiPdfs = [{ id: "related", ownerId: "owner", entryIds: ["sensitive"], objectKey: "harumadi-pdfs/owner/related.pdf" },
    { id: "unrelated", ownerId: "owner", entryIds: ["other"], objectKey: "harumadi-pdfs/owner/unrelated.pdf" }];
  let failStorage = true;
  const deleted: string[] = [];
  let traceDeleted = false;
  let reportDetached = false;
  const db = {
    journalEntry: {
      findFirst: async ({ where }: { where: { ownerId: string; sensitiveWithdrawnAt?: unknown } }) => present && where.ownerId === state.ownerId && (!where.sensitiveWithdrawnAt || state.sensitiveWithdrawnAt) ? state : null,
      findMany: async () => present && state.sensitiveWithdrawnAt ? [state] : [],
      updateMany: async ({ data }: { data: Partial<typeof state> }) => { Object.assign(state, data); return { count: 1 }; },
      deleteMany: async () => { present = false; return { count: 1 }; },
    },
    harumadiPdf: {
      findMany: async ({ where }: { where: { entryIds: { has: string } } }) => harumadiPdfs.filter((harumadiPdf) => harumadiPdf.entryIds.includes(where.entryIds.has)),
      deleteMany: async ({ where }: { where: { id: string } }) => { harumadiPdfs.splice(harumadiPdfs.findIndex((harumadiPdf) => harumadiPdf.id === where.id), 1); return { count: 1 }; },
    },
    journalShareTrace: { deleteMany: async () => { traceDeleted = true; return { count: 1 }; } },
    contentReport: { updateMany: async () => { reportDetached = true; return { count: 1 }; } },
  };
  const globals = globalThis as { prisma?: unknown; tutiObjectStorageClient?: unknown };
  const previousDb = globals.prisma;
  const previousStorage = globals.tutiObjectStorageClient;
  globals.prisma = { ...db, $transaction: async (operation: (tx: typeof db) => Promise<unknown>) => operation(db) };
  // 객체 저장소 대역만 사용한다. 운영 S3 요청은 절대 보내지 않는다.
  globals.tutiObjectStorageClient = { send: async (command: { input: { Key: string } }) => {
    if (failStorage) throw new Error("injected storage outage");
    deleted.push(command.input.Key); return {};
  } };
  t.after(async () => {
    for (const [key, value] of previous) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    globals.prisma = previousDb;
    globals.tutiObjectStorageClient = previousStorage;
    await rm(directory, { recursive: true, force: true });
  });
  const { initializePrivacyReplayLedger, readPrivacyReplaySnapshot } = await import("../src/server/legal/privacyReplayLedger");
  const { withdrawSensitiveJournal, maintainSensitiveWithdrawals } = await import("../src/server/journal/sensitiveWithdrawal");
  await initializePrivacyReplayLedger();
  assert.deepEqual(await withdrawSensitiveJournal("another-owner", "sensitive"), { found: false, pending: false });
  assert.equal(state.content, "private-body");
  assert.deepEqual(await withdrawSensitiveJournal("owner", "sensitive"), { found: true, pending: true });
  assert.equal(state.title, "");
  assert.equal(state.content, "");
  assert.equal(state.publicId, null);
  assert.equal(state.publicationStatus, "private");
  assert.ok(state.sensitiveWithdrawnAt);
  assert.equal(present, true, "정리 키는 재시도를 위해 남긴다.");
  assert.equal(harumadiPdfs.length, 2);
  assert.deepEqual(deleted, []);
  assert.ok((await readPrivacyReplaySnapshot()).committed.some((record) => record.kind === "journal_sensitive_withdrawn"));
  assert.deepEqual(await maintainSensitiveWithdrawals(), { mode: "dry-run", inspected: 1, completed: 0, failed: 0 });
  assert.deepEqual(await maintainSensitiveWithdrawals(true), { mode: "applied", inspected: 1, completed: 0, failed: 1 });
  failStorage = false;
  assert.deepEqual(await maintainSensitiveWithdrawals(true), { mode: "applied", inspected: 1, completed: 1, failed: 0 });
  assert.equal(present, false);
  assert.equal(traceDeleted && reportDetached, true);
  assert.deepEqual(deleted, ["harumadi-pdfs/owner/related.pdf", "journal-images/owner/sensitive/photo.webp"]);
  assert.deepEqual(harumadiPdfs.map((harumadiPdf) => harumadiPdf.id), ["unrelated"]);
  assert.deepEqual(await maintainSensitiveWithdrawals(true), { mode: "applied", inspected: 0, completed: 0, failed: 0 });
});

test("실패 알림은 설정 누락·HTTP 실패를 실패로 반환하고 고정 문구만 전송한다", () => {
  for (const scenario of ["missing", "invalid", "success", "http-failure", "network-failure"]) {
    const code = `
      import assert from 'node:assert/strict';
      const scenario = ${JSON.stringify(scenario)};
      let calls = 0;
      globalThis.fetch = async (url, options) => {
        calls++;
        assert.equal(String(url), 'https://example.invalid/test');
        assert.equal(options.method, 'POST');
        assert.equal(options.redirect, 'error');
        assert.deepEqual(JSON.parse(options.body), {text:'Tuti 개인정보·권리 보호 예약 작업에 실패했어요. NAS의 실패한 작업과 운영 로그를 확인해주세요.'});
        if (scenario === 'network-failure') throw new Error('private-provider-error');
        return {ok: scenario === 'success'};
      };
      process.env.LEGAL_RIGHTS_ALERT_WEBHOOK_URL = scenario === 'missing' ? '' : scenario === 'invalid' ? 'http://example.invalid/test' : 'https://example.invalid/test';
      await import('./scripts/notify-legal-job-failure.ts');
      assert.equal(calls, ['missing','invalid'].includes(scenario) ? 0 : 1);
    `;
    const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", code], { encoding: "utf8", timeout: 10000 });
    assert.equal(result.status, scenario === "success" ? 0 : 1, result.stderr);
    assert.doesNotMatch(result.stderr, /private-provider-error/);
  }
});
