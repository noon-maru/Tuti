import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

test("격리 DB에서 동반 장소 등록·재실행·동시 실행·연결 충돌 롤백을 검증한다", { timeout: 30000 }, async t => {
  const bin = (name: string) => process.env.POSTGRES_BIN_DIR ? join(process.env.POSTGRES_BIN_DIR, name) : name;
  if (process.getuid?.() === 0 || ["initdb", "pg_ctl"].some(name => spawnSync(bin(name), ["--version"]).status !== 0)) { t.skip("일반 사용자·PostgreSQL 필요"); return; }
  const root = mkdtempSync(join(tmpdir(), "tuti-dog-catalog-")), data = join(root, "data"), socket = join(root, "socket");
  mkdirSync(socket, { mode: 0o700 });
  const env = { PATH: process.env.PATH, LANG: "C", LC_ALL: "C", NODE_ENV: "test" as const };
  const db = new pg.Client({ host: socket, port: 15496, user: "fixture", database: "postgres" });
  const orm = new PrismaClient({ adapter: new PrismaPg({ host: socket, port: 15496, user: "fixture", database: "postgres" }) });
  const globalDb = globalThis as unknown as { prisma?: unknown }, previous = globalDb.prisma;
  let started = false;
  t.after(async () => { globalDb.prisma = previous; await orm.$disconnect(); await db.end(); if (started) execFileSync(bin("pg_ctl"), ["-D", data, "-m", "fast", "-w", "-t", "10", "stop"], { env, stdio: "pipe" }); rmSync(root, { recursive: true, force: true }); });
  execFileSync(bin("initdb"), ["-D", data, "-U", "fixture", "--no-locale", "--auth-local=trust", "--auth-host=reject"], { env, stdio: "pipe" });
  execFileSync(bin("pg_ctl"), ["-D", data, "-l", join(root, "server.log"), "-o", `-k ${socket} -p 15496 -c listen_addresses='' -c shared_buffers=16MB -c fsync=off`, "-w", "-t", "10", "start"], { env, stdio: "pipe" }); started = true;
  await db.connect();
  await db.query(`
    CREATE TYPE "PlaceReviewStatus" AS ENUM ('pending','approved','rejected');
    CREATE TYPE "PlaceVisibilityOverride" AS ENUM ('auto','show','hide');
    CREATE TYPE "PlaceCandidateOverride" AS ENUM ('auto','include','exclude');
    CREATE TYPE "MovementLevel" AS ENUM ('near','short','half');
    CREATE TABLE places(id text PRIMARY KEY,source text,source_id text UNIQUE,name text,latitude numeric,longitude numeric,
      review_status "PlaceReviewStatus" DEFAULT 'pending',visibility_override "PlaceVisibilityOverride" DEFAULT 'auto',candidate_override "PlaceCandidateOverride" DEFAULT 'auto',
      phrase text,note text,image text,travel_time text,crowd text,today text,fatigue int,movement_level "MovementLevel",mood_tags text[],
      source_address text,source_content_type text,source_area_code text,source_sido_name text,source_sigungu_code text,source_sigungu_name text,source_copyright text,source_synced_at timestamp,
      is_active boolean,location text,experience_type_evidence text[] DEFAULT '{}',candidate_reasons text[] DEFAULT '{}',candidate_exclusions text[] DEFAULT '{}',created_at timestamp DEFAULT CURRENT_TIMESTAMP,updated_at timestamp,UNIQUE(source,source_id));
    CREATE TABLE tourism_place_source_records(content_id text PRIMARY KEY,content_type_id text,title text,area_code text,sido_name text,sigungu_code text,sigungu_name text,
      raw_payload jsonb,linked_place_id text UNIQUE REFERENCES places(id) ON DELETE SET NULL,source_modified_at timestamp,synced_at timestamp,created_at timestamp DEFAULT CURRENT_TIMESTAMP,updated_at timestamp);
    -- Spatial SQL is a stand-in here; actual PostGIS is checked separately in development.
    CREATE FUNCTION ST_MakePoint(double precision,double precision) RETURNS text LANGUAGE sql AS 'SELECT concat($1,'','',$2)';
    CREATE FUNCTION ST_SetSRID(text,integer) RETURNS text LANGUAGE sql AS 'SELECT $1';
  `);
  for (const migration of ["20261116030000_tourism_pet_sources", "20261117010000_dog_place_catalog"]) await db.query(readFileSync(`prisma/migrations/${migration}/migration.sql`, "utf8"));
  globalDb.prisma = orm;
  const { registerDogPlace } = await import("../src/server/tourism/registerDogPlace");
  const basic = (id: string) => ({ source: "pet-list" as const, contentId: id, fetchedAt: new Date().toISOString(), item: { contentid: id, title: "함께 카페", mapy: "37.5", mapx: "127.1", addr1: "서울특별시 강남구" } });
  await orm.tourismPetSourceRecord.createMany({ data: ["1", "2"].map(contentId => ({ source: "kor", contentId, rawPayload: { contentid: contentId, acmpyTypeCd: "전구역 동반가능" }, sourceUrl: "https://www.data.go.kr/data/15101578/openapi.do", fetchedAt: new Date(Date.now() - 1000) })) });
  assert.equal((await registerDogPlace("1", basic("1"), false)).created, true);
  assert.equal(await orm.dogPlaceCatalog.count(), 0);
  await Promise.all([registerDogPlace("1", basic("1"), true), registerDogPlace("1", basic("1"), true)]);
  assert.equal(await orm.dogPlaceCatalog.count(), 1);
  assert.equal((await db.query("SELECT location IS NOT NULL ready FROM places WHERE id='tourapi-1'")).rows[0].ready, true);
  await db.query("INSERT INTO places(id,source,source_id) VALUES('other','tourapi','999'); INSERT INTO tourism_place_source_records(content_id,linked_place_id) VALUES('2','other')");
  await assert.rejects(registerDogPlace("2", basic("2"), true), /PLACE_LINK_CONFLICT/);
  assert.equal((await db.query("SELECT count(1)::int n FROM places WHERE id='tourapi-2'")).rows[0].n, 0);
  assert.equal(await orm.dogPlaceCatalog.count(), 1);
  await db.query("UPDATE places SET name='운영자 편집',visibility_override='hide' WHERE id='tourapi-1'");
  await registerDogPlace("1", basic("1"), true);
  assert.equal((await orm.dogPlaceCatalog.findUniqueOrThrow({ where: { placeId: "tourapi-1" } })).status, "excluded");
  assert.equal((await db.query("SELECT name FROM places WHERE id='tourapi-1'")).rows[0].name, "운영자 편집");
});
