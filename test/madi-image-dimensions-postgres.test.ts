import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";

test("사진 크기 마이그레이션은 기존 사진을 보존하고 잘못된 크기 쌍을 거절한다", { timeout: 20000 }, async t => {
  const bin = (name: string) => process.env.POSTGRES_BIN_DIR ? join(process.env.POSTGRES_BIN_DIR, name) : name;
  if (process.getuid?.() === 0 || ["initdb", "pg_ctl"].some(name => spawnSync(bin(name), ["--version"]).status !== 0)) {
    t.skip("격리 PostgreSQL 실행 파일과 일반 사용자가 필요합니다."); return;
  }
  const root = mkdtempSync(join(tmpdir(), "tuti-photo-size-")), data = join(root, "data"), socket = join(root, "socket");
  mkdirSync(socket, { mode: 0o700 });
  const env = { ...process.env, LANG: "C", LC_ALL: "C", PGOPTIONS: "", PGSERVICE: undefined, PGSERVICEFILE: undefined, PGPASSWORD: undefined };
  const client = new pg.Client({ host: socket, port: 15487, user: "fixture", database: "postgres" });
  let started = false;
  t.after(async () => {
    await client.end();
    if (started || existsSync(join(data, "postmaster.pid"))) execFileSync(bin("pg_ctl"), ["-D", data, "-m", "fast", "-w", "-t", "10", "stop"], { env, stdio: "pipe" });
    rmSync(root, { recursive: true, force: true });
  });
  execFileSync(bin("initdb"), ["-D", data, "-U", "fixture", "--no-locale", "--encoding=UTF8", "--auth-local=trust", "--auth-host=reject"], { env, stdio: "pipe" });
  execFileSync(bin("pg_ctl"), ["-D", data, "-l", join(root, "server.log"), "-o", `-k ${socket} -p 15487 -c listen_addresses='' -c shared_buffers=16MB -c fsync=off`, "-w", "-t", "10", "start"], { env, stdio: "pipe" });
  started = true; await client.connect();
  await client.query("CREATE TABLE journal_entries(id text PRIMARY KEY, image text); INSERT INTO journal_entries VALUES ('legacy','synthetic.webp');");
  await client.query(readFileSync("prisma/migrations/20261110020000_add_madi_image_dimensions/migration.sql", "utf8"));
  assert.deepEqual((await client.query("SELECT image,image_width,image_height FROM journal_entries WHERE id='legacy'")).rows[0], { image: "synthetic.webp", image_width: null, image_height: null });
  await client.query("INSERT INTO journal_entries VALUES ('portrait','portrait.webp',675,1200)");
  for (const values of ["NULL,1200", "-1,1200", "675,0"]) {
    await assert.rejects(client.query(`INSERT INTO journal_entries VALUES ('bad','bad.webp',${values})`), { code: "23514" });
  }
  await client.query("UPDATE journal_entries SET image=NULL,image_width=NULL,image_height=NULL WHERE id='portrait'");
  assert.equal((await client.query("SELECT count(1)::int AS n FROM journal_entries")).rows[0].n, 2);
});
