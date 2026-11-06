import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import type { Prisma } from "../src/generated/prisma/client";
import { lockMergeAccounts } from "../src/server/auth/mergeLock";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { enqueueDataCleanup } from "../src/server/legal/dataCleanup";
import { consumeEmailChallenge, recordFailedEmailAttempt } from "../src/server/auth/emailChallenge";
import { lockAnonymousDiscard } from "../src/server/auth/anonymousDiscard";

test("격리 DB에서 계정 병합과 신규 작성이 직렬화된다", { timeout: 20000 }, async t => {
  const bin = (name: string) => process.env.POSTGRES_BIN_DIR ? join(process.env.POSTGRES_BIN_DIR, name) : name;
  if (process.getuid?.() === 0 || ["initdb", "pg_ctl"].some(name => spawnSync(bin(name), ["--version"]).status !== 0)) {
    if (process.env.LEGAL_POSTGRES_REQUIRED === "true") throw new Error("격리 PostgreSQL 실행 환경이 필요합니다.");
    t.skip("일반 사용자와 PostgreSQL 실행 파일이 필요합니다."); return;
  }
  const root = mkdtempSync(join(tmpdir(), "tuti-merge-isolation-")), data = join(root, "data"), socket = join(root, "socket");
  mkdirSync(socket, { mode: 0o700 });
  const env = { ...process.env, LANG: "C", LC_ALL: "C", PGOPTIONS: "", PGPASSWORD: undefined, PGSERVICE: undefined, PGSERVICEFILE: undefined };
  const clients: pg.Client[] = [];
  let started = false;
  t.after(async () => {
    await Promise.all(clients.map(client => client.end()));
    if (started || existsSync(join(data, "postmaster.pid"))) execFileSync(bin("pg_ctl"), ["-D", data, "-m", "fast", "-w", "-t", "10", "stop"], { env, stdio: "pipe" });
    rmSync(root, { recursive: true, force: true });
  });
  execFileSync(bin("initdb"), ["-D", data, "-U", "fixture", "--no-locale", "--auth-local=trust", "--auth-host=reject"], { env, stdio: "pipe" });
  execFileSync(bin("pg_ctl"), ["-D", data, "-l", join(root, "server.log"), "-o", `-k ${socket} -p 15483 -c listen_addresses='' -c shared_buffers=16MB -c fsync=off`, "-w", "-t", "10", "start"], { env, stdio: "pipe" });
  started = true;
  for (let i = 0; i < 2; i++) {
    const client = new pg.Client({ host: socket, port: 15483, user: "fixture", database: "postgres" });
    await client.connect(); clients.push(client);
  }
  const [a, b] = clients;
  await a.query("CREATE TABLE users(id text PRIMARY KEY); CREATE TABLE entries(id text PRIMARY KEY, owner_id text REFERENCES users ON DELETE CASCADE); INSERT INTO users VALUES('source'),('target'); INSERT INTO entries VALUES('original','source')");
  const tx = { $queryRaw: async (_sql: TemplateStringsArray, ids: string[]) => (await a.query("SELECT id FROM users WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE", [ids])).rows } as unknown as Prisma.TransactionClient;

  // 작성이 먼저 시작되면 병합은 기다린 뒤 새 마디까지 옮긴다.
  await b.query("BEGIN; SELECT id FROM users WHERE id='source' FOR UPDATE; INSERT INTO entries VALUES('late','source')");
  await a.query("BEGIN; SET LOCAL lock_timeout='3s'");
  const mergeLock = lockMergeAccounts(tx, "source", "target");
  await b.query("COMMIT");
  await mergeLock;
  await a.query("UPDATE entries SET owner_id='target' WHERE owner_id='source'; DELETE FROM users WHERE id='source'; COMMIT");
  assert.equal((await a.query("SELECT count(1)::integer n FROM entries WHERE owner_id='target'")).rows[0].n, 2);

  // 병합이 먼저 시작되면 뒤늦은 저장은 연쇄 삭제되지 않고 명시적으로 실패한다.
  await a.query("INSERT INTO users VALUES('source'); BEGIN");
  await lockMergeAccounts(tx, "source", "target");
  await b.query("BEGIN; SET LOCAL lock_timeout='3s'");
  const writer = b.query("SELECT id FROM users WHERE id='source' FOR UPDATE");
  await a.query("DELETE FROM users WHERE id='source'; COMMIT");
  assert.equal((await writer).rowCount, 0);
  await assert.rejects(b.query("INSERT INTO entries VALUES('rejected','source')"), { code: "23503" });
  await b.query("ROLLBACK");
  assert.equal((await a.query("SELECT count(1)::integer n FROM entries")).rows[0].n, 2);
  await a.query("BEGIN");
  await assert.rejects(lockMergeAccounts(tx, "source", "target"), { code: "account_merge_target_missing" });
  await a.query("ROLLBACK");
  await a.query(readFileSync("prisma/migrations/20261103130000_user_data_cleanup_outbox/migration.sql", "utf8"));
  const orm = new PrismaClient({ adapter: new PrismaPg({ host: socket, port: 15483, user: "fixture", database: "postgres" }) });
  try {
    await a.query("CREATE TABLE email_verification_codes(id text PRIMARY KEY,consumed_at timestamp(3),expires_at timestamp(3),attempts int NOT NULL DEFAULT 0); INSERT INTO email_verification_codes(id,expires_at) VALUES('code',now()+interval '1 hour')");
    const consumed = await Promise.allSettled([1, 2].map(() => orm.$transaction(tx => consumeEmailChallenge(tx, "code"))));
    assert.equal(consumed.filter(r => r.status === "fulfilled").length, 1, "실제 두 연결에서도 코드 소비는 한 번만 성공");
    await a.query("UPDATE email_verification_codes SET consumed_at=null,attempts=0");
    const attempts = await Promise.allSettled(Array.from({ length: 10 }, () => recordFailedEmailAttempt(orm, "code")));
    assert.equal(attempts.filter(r => r.status === "fulfilled").length, 5);
    await assert.rejects(orm.$transaction(tx => consumeEmailChallenge(tx, "code")), { code: "email_code_unavailable" });
    await a.query("UPDATE email_verification_codes SET attempts=0");
    await assert.rejects(orm.$transaction(async tx => { await consumeEmailChallenge(tx, "code"); throw new Error('synthetic rollback'); }), /synthetic rollback/);
    assert.equal((await a.query("SELECT consumed_at FROM email_verification_codes")).rows[0].consumed_at, null);

    await a.query("INSERT INTO users VALUES('source'); CREATE TABLE auth_identities(id text PRIMARY KEY,user_id text); CREATE TABLE journal_entries(id text PRIMARY KEY,owner_id text REFERENCES users); CREATE TABLE harumadis(id text PRIMARY KEY,owner_id text); CREATE TABLE harumadi_pdfs(id text PRIMARY KEY,owner_id text)");
    await b.query("BEGIN; SELECT id FROM users WHERE id='source' FOR UPDATE; INSERT INTO journal_entries VALUES('late','source')");
    const discard = orm.$transaction(tx => lockAnonymousDiscard(tx, "source", "target", false));
    const rejection = assert.rejects(discard, { code: "account_discard_content_changed" });
    await b.query("COMMIT"); await rejection;
    await a.query("DELETE FROM journal_entries; DELETE FROM users WHERE id='source'");
    const payload = { images: ["journal-images/fixture/a/a.webp"], pdfs: [], appleTokens: [], receipt: null };
    await assert.rejects(orm.$transaction(async tx => {
      await enqueueDataCleanup(tx, payload);
      await tx.$executeRaw`DELETE FROM users WHERE id = 'target'`;
      throw new Error("fixture rollback");
    }), /fixture rollback/);
    assert.equal(await orm.userDataCleanupJob.count(), 0);
    assert.equal((await a.query("SELECT count(1)::integer n FROM entries")).rows[0].n, 2);
    await orm.$transaction(async tx => {
      await enqueueDataCleanup(tx, payload);
      await tx.$executeRaw`DELETE FROM users WHERE id = 'target'`;
    });
    assert.equal(await orm.userDataCleanupJob.count(), 1, "계정이 없어져도 정리 예약은 보존한다");
    assert.equal((await a.query("SELECT count(1)::integer n FROM entries")).rows[0].n, 0);
  } finally { await orm.$disconnect(); }
});
