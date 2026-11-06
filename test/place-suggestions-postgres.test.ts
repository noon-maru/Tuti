import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import pg from "pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

test("장소 제안은 실제 DB에서 본인 기록만 검색하고 민감·철회 기록을 제외한다", { timeout: 20000 }, async t => {
  const bin = (name: string) => process.env.POSTGRES_BIN_DIR ? join(process.env.POSTGRES_BIN_DIR, name) : name;
  if (process.getuid?.() === 0 || ["initdb", "pg_ctl"].some(name => spawnSync(bin(name), ["--version"]).status !== 0)) {
    if (process.env.LEGAL_POSTGRES_REQUIRED === "true") throw new Error("격리 PostgreSQL 환경이 필요합니다.");
    t.skip("격리 PostgreSQL 실행 파일과 일반 사용자가 필요합니다."); return;
  }
  const root = mkdtempSync(join(tmpdir(), "tuti-place-suggestions-")), data = join(root, "data"), socket = join(root, "socket");
  mkdirSync(socket, { mode: 0o700 });
  const env = { ...process.env, LANG: "C", LC_ALL: "C", PGOPTIONS: "", PGSERVICE: undefined, PGSERVICEFILE: undefined, PGPASSWORD: undefined };
  let started = false;
  const client = new pg.Client({ host: socket, port: 15484, user: "fixture", database: "postgres" });
  const orm = new PrismaClient({ adapter: new PrismaPg({ host: socket, port: 15484, user: "fixture", database: "postgres" }) });
  const globals = globalThis as unknown as { prisma?: unknown }, oldDb = globals.prisma;
  const flag = process.env.SENSITIVE_MADI_WORKFLOW_ENABLED;
  t.after(async () => {
    globals.prisma = oldDb;
    if (flag === undefined) delete process.env.SENSITIVE_MADI_WORKFLOW_ENABLED; else process.env.SENSITIVE_MADI_WORKFLOW_ENABLED = flag;
    await orm.$disconnect(); await client.end();
    if (started || existsSync(join(data, "postmaster.pid"))) execFileSync(bin("pg_ctl"), ["-D", data, "-m", "fast", "-w", "-t", "10", "stop"], { env, stdio: "pipe" });
    rmSync(root, { recursive: true, force: true });
  });
  execFileSync(bin("initdb"), ["-D", data, "-U", "fixture", "--no-locale", "--encoding=UTF8", "--auth-local=trust", "--auth-host=reject"], { env, stdio: "pipe" });
  execFileSync(bin("pg_ctl"), ["-D", data, "-l", join(root, "server.log"), "-o", `-k ${socket} -p 15484 -c listen_addresses='' -c shared_buffers=16MB -c fsync=off`, "-w", "-t", "10", "start"], { env, stdio: "pipe" });
  started = true; await client.connect();
  await client.query(`CREATE TYPE "PlaceReviewStatus" AS ENUM ('pending','approved','rejected');
    CREATE TABLE places(id text PRIMARY KEY,name text,is_active boolean,review_status "PlaceReviewStatus",source_address text,source_sido_name text,source_sigungu_name text);
    CREATE TABLE journal_entries(id text PRIMARY KEY,owner_id text,place_name text,place_id text,updated_at timestamp(3),sensitive_content boolean,sensitive_withdrawn_at timestamp(3));
    INSERT INTO places VALUES('park','양평 유수지 생태공원',true,'approved','양평','경기도','양평군'),('other','양평 공원',true,'approved','양평','경기도','양평군'),('inactive','닫힌 장소',false,'approved','','경기도','양평군');
    INSERT INTO journal_entries VALUES
    ('a','owner','양평 유수지 생태공원','park','2026-11-01',false,null),
    ('b','owner','양평 유수지 생태공원','park','2026-11-05',false,null),
    ('c','owner','양평 나만의 벤치',null,'2026-11-06',false,null),
    ('d','another','양평 타인 비공개 장소',null,'2026-11-06',false,null),
    ('e','owner','양평 민감 장소',null,'2026-11-06',true,null),
    ('f','owner','양평 철회 장소',null,'2026-11-06',false,now()),
    ('g','owner','남긴 공간',null,'2026-11-06',false,null),
    ('h','owner','   ',null,'2026-11-06',false,null),
    ('i','owner','양평 예전 장소','inactive','2026-11-02',null,null),
    ('j','owner','양평 100% 공원',null,'2026-11-02',false,null)`);
  globals.prisma = orm; process.env.SENSITIVE_MADI_WORKFLOW_ENABLED = "false";
  const { suggestJournalPlaces } = await import("../src/server/places/suggestions");
  const result = await suggestJournalPlaces("owner", "양평");
  assert.deepEqual(result.history.map(row => row.name), ["양평 나만의 벤치", "양평 유수지 생태공원", "양평 100% 공원", "양평 예전 장소"]);
  assert.equal(result.history.find(row => row.name === "양평 예전 장소")?.id, null);
  assert.equal(result.history.find(row => row.id === "park")?.region, "경기도 양평군");
  assert.deepEqual(result.places.map(row => row.id), ["other"]);
  assert.equal((await suggestJournalPlaces("owner", "양평유수지")).history.length, 1);
  assert.deepEqual((await suggestJournalPlaces("owner", "%")).history.map(row => row.name), ["양평 100% 공원"]);
  const recent = await suggestJournalPlaces("owner", ""); assert.equal(recent.places.length, 0);
  assert.ok(recent.history.every(row => !/타인|민감|철회|남긴 공간/.test(row.name)));
  process.env.SENSITIVE_MADI_WORKFLOW_ENABLED = "true";
  assert.ok((await suggestJournalPlaces("owner", "양평")).history.every(row => row.name !== "양평 예전 장소"));
});
