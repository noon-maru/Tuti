import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { recentHarumadiIds } from "../src/server/harumadi/recent";

test("최근 책은 실제 DB에서 본인의 성공 사건과 현재 책 접근권·보관기간으로만 고른다", { timeout: 20000 }, async t => {
  const bin = (name: string) => process.env.POSTGRES_BIN_DIR ? join(process.env.POSTGRES_BIN_DIR, name) : name;
  if (process.getuid?.() === 0 || ["initdb", "pg_ctl"].some(name => spawnSync(bin(name), ["--version"]).status !== 0)) {
    if (process.env.LEGAL_POSTGRES_REQUIRED === "true") throw Error("격리 PostgreSQL 실행 환경이 필요합니다.");
    t.skip("격리 PostgreSQL 실행 파일과 일반 사용자가 필요합니다."); return;
  }
  const root = mkdtempSync(join(tmpdir(), "tuti-recent-books-")), data = join(root, "data"), socket = join(root, "socket");
  mkdirSync(socket, { mode: 0o700 });
  const env = { ...process.env, LANG: "C", LC_ALL: "C", PGOPTIONS: "", PGSERVICE: undefined, PGSERVICEFILE: undefined, PGPASSWORD: undefined };
  const connection = { host: socket, port: 15486, user: "fixture", database: "postgres" };
  const client = new pg.Client(connection), orm = new PrismaClient({ adapter: new PrismaPg(connection) });
  let started = false;
  t.after(async () => {
    await orm.$disconnect(); await client.end();
    if (started || existsSync(join(data, "postmaster.pid"))) execFileSync(bin("pg_ctl"), ["-D", data, "-m", "fast", "-w", "-t", "10", "stop"], { env, stdio: "pipe" });
    rmSync(root, { recursive: true, force: true });
  });
  execFileSync(bin("initdb"), ["-D", data, "-U", "fixture", "--no-locale", "--encoding=UTF8", "--auth-local=trust", "--auth-host=reject"], { env, stdio: "pipe" });
  execFileSync(bin("pg_ctl"), ["-D", data, "-l", join(root, "server.log"), "-o", `-k ${socket} -p 15486 -c listen_addresses='' -c shared_buffers=16MB -c fsync=off`, "-w", "-t", "10", "start"], { env, stdio: "pipe" });
  started = true; await client.connect();
  await client.query(`CREATE TABLE harumadis(id text PRIMARY KEY, owner_id text);
    CREATE TABLE harumadi_members(harumadi_id text,user_id text,ended_at timestamp(3));
    CREATE TABLE lifecycle_events(user_id text,name text,book_id text,occurred_at timestamp(3),retention_until timestamp(3));
    INSERT INTO harumadis VALUES ('a','owner'),('b','owner'),('c','owner'),('old','owner'),('shared','another'),('ended','another'),('private','another');
    INSERT INTO harumadi_members VALUES ('shared','owner',null),('ended','owner','2026-11-09');
    INSERT INTO lifecycle_events VALUES
      ('owner','madi_added','a','2026-11-01','2027-01-01'),
      ('owner','madi_added','a','2026-10-01','2027-01-01'),
      ('owner','book_opened','a','2026-11-09','2027-01-01'),
      ('another','madi_added','a','2026-11-09','2027-01-01'),
      ('owner','madi_created','b','2026-11-03','2027-01-01'),
      ('owner','madi_added','c','2026-11-02','2027-01-01'),
      ('owner','madi_added','shared','2026-11-05','2027-01-01'),
      ('owner','madi_added','ended','2026-11-09','2027-01-01'),
      ('owner','madi_added','private','2026-11-09','2027-01-01'),
      ('owner','madi_added','deleted','2026-11-09','2027-01-01'),
      ('owner','madi_added','old','2026-11-09','2026-11-09');`);
  const now = new Date("2026-11-10T00:00:00Z");
  assert.deepEqual((await recentHarumadiIds(orm, "owner", true, now)).map(row => row.id), ["shared", "b", "c"]);
  assert.deepEqual((await recentHarumadiIds(orm, "owner", false, now)).map(row => row.id), ["b", "c", "a"]);
  assert.deepEqual(await recentHarumadiIds(orm, "another", true, now), []);
  await client.query("UPDATE harumadi_members SET ended_at=now() WHERE harumadi_id='shared'");
  assert.deepEqual((await recentHarumadiIds(orm, "owner", true, now)).map(row => row.id), ["b", "c", "a"]);
});
