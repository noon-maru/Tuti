import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { Pool } from "pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const socket = process.argv[2];
assert.ok(socket.includes("tuti-legal-postgres-") && socket.endsWith("/socket"));
const schema = "tuti_end_together_fixture";
const connection = { host: socket, port: 15479, user: "tuti_legal_test", database: "postgres", ssl: false as const };
const pool = new Pool({ ...connection, options: `-c search_path=${schema},public` });
const client = new PrismaClient({ adapter: new PrismaPg({ ...connection, max: 3, application_name: "tuti-end-together-test", options: `-c search_path=${schema},public` }, { schema }) });
process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
process.env.PRIVACY_REPLAY_LEDGER_ENABLED = "false";
process.env.HARUMADI_TOGETHER_ENABLED = "true";
(globalThis as { prisma?: unknown }).prisma = client;
try {
  await pool.query(`CREATE SCHEMA ${schema};
    CREATE TABLE users(id text PRIMARY KEY);
    CREATE TABLE journal_entries(id text PRIMARY KEY,owner_id text NOT NULL REFERENCES users(id));
    CREATE TABLE harumadis(id text PRIMARY KEY,owner_id text NOT NULL REFERENCES users(id),revision integer NOT NULL DEFAULT 1,access_revision integer NOT NULL DEFAULT 1,collaboration_started_at timestamp,updated_at timestamp NOT NULL DEFAULT now());
    CREATE TABLE harumadi_members(id text PRIMARY KEY,harumadi_id text NOT NULL REFERENCES harumadis(id),user_id text NOT NULL REFERENCES users(id),joined_at timestamp NOT NULL DEFAULT now(),ended_at timestamp);
    CREATE TABLE harumadi_invites(id text PRIMARY KEY,harumadi_id text NOT NULL REFERENCES harumadis(id),revoked_at timestamp);
    CREATE TABLE harumadi_comments(id text PRIMARY KEY,harumadi_id text NOT NULL REFERENCES harumadis(id),author_id text REFERENCES users(id),body text NOT NULL,revision integer NOT NULL DEFAULT 1,deleted_at timestamp,updated_at timestamp NOT NULL DEFAULT now());
    CREATE TABLE harumadi_entry_links(id text PRIMARY KEY,harumadi_id text NOT NULL REFERENCES harumadis(id),entry_id text NOT NULL REFERENCES journal_entries(id));
    CREATE TABLE harumadi_pdfs(id text PRIMARY KEY,owner_id text NOT NULL REFERENCES users(id),snapshot text NOT NULL);
    INSERT INTO users VALUES ('maker'),('a'),('b');
    INSERT INTO journal_entries VALUES ('mine','maker'),('a-original','a'),('b-original','b');
    INSERT INTO harumadis(id,owner_id,collaboration_started_at) VALUES ('shared','maker',now()),('other','maker',now());
    INSERT INTO harumadi_members(id,harumadi_id,user_id) VALUES ('member-a','shared','a'),('member-b','shared','b');
    INSERT INTO harumadi_invites(id,harumadi_id) VALUES ('pending','shared'),('other-invite','other');
    INSERT INTO harumadi_comments(id,harumadi_id,author_id,body) VALUES ('own','shared','maker','synthetic'),('reply','shared','a','synthetic'),('other-comment','other','maker','preserved');
    INSERT INTO harumadi_entry_links VALUES ('mine-link','shared','mine'),('a-link','shared','a-original'),('b-link','shared','b-original'),('other-link','other','a-original');
    INSERT INTO harumadi_pdfs VALUES ('pdf','a','immutable-snapshot');`);
  const count = async (sql: string) => Number((await pool.query<{ count: string }>(sql)).rows[0].count);
  const { endTogether } = await import("../../src/server/harumadi/endTogether");
  const { requireHarumadiAccess } = await import("../../src/server/harumadi/access");
  await assert.rejects(endTogether("a", "shared"), { status: 404 });
  await pool.query(`CREATE FUNCTION fail_end() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic-stop-error'; END $$;
    CREATE TRIGGER fail_end BEFORE UPDATE ON harumadis FOR EACH ROW EXECUTE FUNCTION fail_end();`);
  await assert.rejects(endTogether("maker", "shared"), /synthetic-stop-error/);
  assert.equal(await count("SELECT count(1) FROM harumadi_members WHERE ended_at IS NULL"), 2);
  assert.equal(await count("SELECT count(1) FROM harumadi_entry_links WHERE harumadi_id='shared'"), 3);
  assert.equal(await count("SELECT count(1) FROM harumadi_comments WHERE deleted_at IS NULL"), 3);
  await pool.query("DROP TRIGGER fail_end ON harumadis; DROP FUNCTION fail_end()");

  const lock = await pool.connect();
  try {
    await lock.query("BEGIN; SELECT id FROM harumadis WHERE id='shared' FOR UPDATE");
    const stopping = endTogether("maker", "shared").then(() => ({ status: 200 }), error => ({ status: error.status }));
    let waiting = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      waiting = await count("SELECT count(1) FROM pg_stat_activity WHERE application_name='tuti-end-together-test' AND wait_event_type='Lock'") > 0;
      if (waiting) break;
      await delay(10);
    }
    assert(waiting, "종료 쓰기는 실제 책 행 잠금에서 대기해야 한다");
    await lock.query("INSERT INTO harumadi_invites(id,harumadi_id) VALUES ('racing-invite','shared'); COMMIT");
    assert.equal((await stopping).status, 409, "조회 뒤 추가된 초대를 누락하고 종료하지 않는다");
  } finally { await lock.query("ROLLBACK"); lock.release(); }
  await Promise.all([endTogether("maker", "shared"), endTogether("maker", "shared")]);
  await endTogether("maker", "shared");
  assert.equal(await count("SELECT count(1) FROM harumadis WHERE id='shared' AND collaboration_started_at IS NULL"), 1);
  assert.equal(await count("SELECT count(1) FROM harumadi_members WHERE harumadi_id='shared' AND ended_at IS NULL"), 0);
  assert.equal(await count("SELECT count(1) FROM harumadi_invites WHERE harumadi_id='shared' AND revoked_at IS NULL"), 0);
  assert.equal(await count("SELECT count(1) FROM harumadi_comments WHERE harumadi_id='shared' AND (body<>'' OR author_id IS NOT NULL OR deleted_at IS NULL)"), 0);
  assert.equal(await count("SELECT count(1) FROM harumadi_entry_links WHERE harumadi_id='shared'"), 1);
  assert.equal(await count("SELECT count(1) FROM journal_entries"), 3);
  assert.equal(await count("SELECT count(1) FROM harumadi_entry_links WHERE harumadi_id='other'"), 1);
  assert.equal(await count("SELECT count(1) FROM harumadi_invites WHERE id='other-invite' AND revoked_at IS NULL"), 1);
  assert.equal(await count("SELECT count(1) FROM harumadi_pdfs WHERE snapshot='immutable-snapshot'"), 1);
  await assert.rejects(client.$transaction(tx => requireHarumadiAccess(tx, "a", "shared")), { status: 404 });
  console.log(JSON.stringify({ isolatedPostgres: true, ownerOnly: true, rollbackVerified: true, concurrentInviteProtected: true, originalEntriesPreserved: true, savedPdfPreserved: true }));
} finally {
  await client.$disconnect();
  delete (globalThis as { prisma?: unknown }).prisma;
  await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await pool.end();
}
