import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import type { DemoFixture } from "../../scripts/seed-demo-harumadis";

const socket = process.argv[2];
assert.ok(socket.includes("tuti-legal-postgres-") && socket.endsWith("/socket"));
const schema = "tuti_demo_fixture";
const connection = { host: socket, port: 15479, user: "tuti_legal_test", database: "postgres", ssl: false as const, options: `-c search_path=${schema},public` };
const pool = new Pool(connection);
const client = new PrismaClient({ adapter: new PrismaPg({ ...connection, max: 3 }, { schema }) });
process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
(globalThis as { prisma?: unknown }).prisma = client;
try {
  await pool.query(`CREATE SCHEMA ${schema}; SET search_path=${schema},public;
    CREATE TYPE "AuthProvider" AS ENUM ('email','google','kakao','apple');
    CREATE TYPE "UserRole" AS ENUM ('user','admin');
    CREATE TYPE "JournalPublicationStatus" AS ENUM ('private','pending','published','hidden');
    CREATE TYPE "LogLevel" AS ENUM ('info','warning','error');
    CREATE TABLE users(id text PRIMARY KEY,display_name text,role "UserRole");
    CREATE TABLE auth_identities(id text PRIMARY KEY,user_id text REFERENCES users(id) ON DELETE CASCADE,provider "AuthProvider");
    CREATE TABLE places(id text PRIMARY KEY,name text,image text,source_copyright text);
    CREATE TABLE harumadis(id text PRIMARY KEY,owner_id text REFERENCES users(id) ON DELETE CASCADE,title text,cover_style text,
      back_cover_text text,period_start date,period_end date,revision integer DEFAULT 1,access_revision integer DEFAULT 0,
      collaboration_started_at timestamp,created_at timestamp DEFAULT now(),updated_at timestamp DEFAULT now());
    CREATE TABLE journal_entries(id text PRIMARY KEY,owner_id text REFERENCES users(id) ON DELETE CASCADE,title text,content text,
      image text,image_width integer,image_height integer,place_id text REFERENCES places(id),place_name text,visited_at timestamp,
      sensitive_content boolean,sensitive_consent_version text,sensitive_consented_at timestamp,sensitive_withdrawn_at timestamp,
      public_id text,published_at timestamp,publication_status "JournalPublicationStatus" DEFAULT 'private',publication_status_changed_at timestamp DEFAULT now(),
      publication_review_reasons jsonb,publication_reviewed_at timestamp,publication_reviewer_user_id text,publication_consent_version text,
      publication_consented_at timestamp,created_at timestamp DEFAULT now(),updated_at timestamp DEFAULT now());
    CREATE TABLE harumadi_entry_links(id text UNIQUE,harumadi_id text REFERENCES harumadis(id) ON DELETE CASCADE,
      entry_id text REFERENCES journal_entries(id) ON DELETE CASCADE,position integer,PRIMARY KEY(harumadi_id,entry_id));
    CREATE TABLE system_logs(id text PRIMARY KEY,level "LogLevel" DEFAULT 'info',category text,action text,message text,actor_user_id text,
      target_type text,target_id text,metadata jsonb,created_at timestamp DEFAULT now());
    CREATE TABLE user_data_cleanup_jobs(id text PRIMARY KEY,payload jsonb,created_at timestamp DEFAULT now(),next_attempt_at timestamp DEFAULT now(),
      attempts integer DEFAULT 0,lease_token text,lease_until timestamp);
    INSERT INTO users VALUES ('demo-a','정연한','user'),('demo-b','정연한','user');
    INSERT INTO auth_identities VALUES('a-kakao','demo-a','kakao'),('b-google','demo-b','google');
    INSERT INTO harumadis(id,owner_id,title,cover_style) VALUES('original-a','demo-a','기존 책','white-plain'),('original-b','demo-b','다른 책','white-plain');
    INSERT INTO journal_entries(id,owner_id,title,content,place_name,visited_at) VALUES('original-a','demo-a','기존 마디','보존','기존',now()),('original-b','demo-b','다른 마디','보존','다른',now());`);
  const fixture = JSON.parse(readFileSync("data/demo-harumadis/2026-11-14.json", "utf8")) as DemoFixture;
  for (const p of fixture.photos) await pool.query("INSERT INTO places VALUES($1,$2,$3,$4)", [p.placeId, p.name, p.url, p.copyright]);
  const { applyDemo, inspectDemo, verifyDemo } = await import("../../scripts/seed-demo-harumadis");
  let uploads = 0;
  const files = { prepare: async () => ({ bytes: Buffer.from("fixture"), width: 940, height: 626 }),
    put: async () => { uploads++; }, verify: async () => {}, clean: async (id: string) => { await client.userDataCleanupJob.deleteMany({ where: { id } }); } };
  const plan = await inspectDemo(fixture, undefined, client);
  assert.equal(plan.user.id, "demo-a", "같은 이름의 Google 계정은 선택하지 않는다.");
  await pool.query(`CREATE FUNCTION ${schema}.fail_demo_link() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF (SELECT count(*) FROM ${schema}.harumadi_entry_links)=3 THEN RAISE EXCEPTION 'synthetic failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER fail_link BEFORE INSERT ON harumadi_entry_links FOR EACH ROW EXECUTE PROCEDURE ${schema}.fail_demo_link();`);
  await assert.rejects(applyDemo(fixture, "demo-a", plan.planHash, client, files));
  assert.equal(await client.harumadi.count(), 2); assert.equal(await client.journalEntry.count(), 2);
  assert.equal(await client.harumadiEntryLink.count(), 0); assert.equal(await client.systemLog.count(), 0);
  assert.equal(await client.userDataCleanupJob.count(), 0);
  await pool.query("DROP TRIGGER fail_link ON harumadi_entry_links");
  await applyDemo(fixture, "demo-a", plan.planHash, client, files);
  assert.equal(await client.harumadi.count({ where: { ownerId: "demo-a" } }), 6);
  assert.equal(await client.journalEntry.count({ where: { ownerId: "demo-a" } }), 16);
  assert.equal(await client.harumadi.count({ where: { ownerId: "demo-b" } }), 1);
  assert.equal(await client.journalEntry.count({ where: { ownerId: "demo-b" } }), 1);
  assert.equal((await client.journalEntry.findUniqueOrThrow({ where: { id: "original-a" } })).content, "보존");
  assert.equal((await verifyDemo(fixture, "demo-a", client, files)).imagesReadBack, 11);
  const beforeUploads = uploads;
  assert.equal((await applyDemo(fixture, "demo-a", plan.planHash, client, files)).mode, "already-present");
  assert.equal(uploads, beforeUploads);
  await client.journalEntry.delete({ where: { id: plan.records.entries[0].id } });
  await assert.rejects(applyDemo(fixture, "demo-a", plan.planHash, client, files), /DEMO_PARTIAL_OR_CHANGED/);
  assert.equal(await client.harumadiEntryLink.count(), 14);
  console.log("격리 DB: 카카오 계정 한정·기존 자료 보존·5권/15마디 원자적 추가·중복 방지 검증 완료");
} finally {
  await client.$disconnect(); await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await pool.end();
  delete (globalThis as { prisma?: unknown }).prisma;
}
