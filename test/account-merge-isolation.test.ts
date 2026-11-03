import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import type { Prisma } from "../src/generated/prisma/client";
import { lockMergeAccounts } from "../src/server/auth/mergeLock";

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
});
