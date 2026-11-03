import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const socket = process.argv[2];
assert.ok(socket.includes("tuti-legal-postgres-") && socket.endsWith("/socket"));
const schema = "tuti_order_fixture";
const connection = { host: socket, port: 15479, user: "tuti_legal_test", database: "postgres", ssl: false as const };
const pool = new Pool({ ...connection, options: `-c search_path=${schema},public` });
const client = new PrismaClient({ adapter: new PrismaPg({ ...connection, max: 3, options: `-c search_path=${schema},public` }, { schema }) });
process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
process.env.PRIVACY_REPLAY_LEDGER_ENABLED = "false";
process.env.HARUMADI_TOGETHER_ENABLED = "true";
(globalThis as { prisma?: unknown }).prisma = client;
try {
  await pool.query(`CREATE SCHEMA ${schema};
    CREATE TABLE users(id text PRIMARY KEY);
    CREATE TABLE journal_entries(id text PRIMARY KEY,visited_at timestamp NOT NULL,sensitive_withdrawn_at timestamp);
    CREATE TABLE harumadis(id text PRIMARY KEY,owner_id text NOT NULL REFERENCES users(id),title text NOT NULL DEFAULT 'synthetic',cover_style text NOT NULL DEFAULT 'white-plain',back_cover_text text NOT NULL DEFAULT 'synthetic',revision integer NOT NULL DEFAULT 1,access_revision integer NOT NULL DEFAULT 0,collaboration_started_at timestamp,created_at timestamp NOT NULL DEFAULT now(),updated_at timestamp NOT NULL DEFAULT now());
    CREATE TABLE harumadi_members(id text PRIMARY KEY,harumadi_id text REFERENCES harumadis(id),user_id text,ended_at timestamp);
    CREATE TABLE harumadi_entry_links(id text UNIQUE,harumadi_id text REFERENCES harumadis(id),entry_id text REFERENCES journal_entries(id),PRIMARY KEY(harumadi_id,entry_id));
    INSERT INTO users VALUES('maker'),('member'),('outsider');
    INSERT INTO journal_entries VALUES('a','2026-10-03',null),('b','2026-10-01',null),('c','2026-09-01',null);
    INSERT INTO harumadis(id,owner_id) VALUES('book','maker'),('other','maker');
    INSERT INTO harumadi_entry_links VALUES('link-a','book','a'),('link-b','book','b'),('other-a','other','a');
    INSERT INTO harumadi_members VALUES('membership','book','member',null);`);
  await pool.query(readFileSync("prisma/migrations/20261102180000_harumadi_entry_order/migration.sql", "utf8"));
  const { reorderHarumadi, readHarumadi } = await import("../../src/server/harumadi/service");
  assert.deepEqual((await readHarumadi("maker", "book")).entryIds, ["b", "a"]);
  await assert.rejects(reorderHarumadi("member", "book", { revision: 1, entryIds: ["a", "b"] }), { status: 404 });
  await assert.rejects(reorderHarumadi("outsider", "book", { revision: 1, entryIds: ["a", "b"] }), { status: 404 });
  for (const entryIds of [["a"], ["a", "c"], ["a", "a"]]) await assert.rejects(reorderHarumadi("maker", "book", { revision: 1, entryIds }), { status: 409 });
  const changed = await reorderHarumadi("maker", "book", { revision: 1, entryIds: ["a", "b"] });
  assert.equal(changed.revision, 2);
  assert.deepEqual(changed.entryIds, ["a", "b"]);
  assert.deepEqual((await readHarumadi("maker", "other")).entryIds, ["a"]);
  await pool.query("INSERT INTO harumadis(id,owner_id) VALUES('legacy-book','maker'),('mixed-book','maker'); INSERT INTO harumadi_entry_links(id,harumadi_id,entry_id,position) VALUES('legacy-a','legacy-book','a',null),('legacy-b','legacy-book','b',null),('mixed-a','mixed-book','a',5),('mixed-b','mixed-book','b',null),('mixed-c','mixed-book','c',null)");
  const legacy = (await readHarumadi("maker", "legacy-book")).entryIds;
  const mixed = (await readHarumadi("maker", "mixed-book")).entryIds;
  await pool.query(readFileSync("prisma/migrations/20261103010000_harumadi_append_order/migration.sql", "utf8"));
  assert.deepEqual((await readHarumadi("maker", "legacy-book")).entryIds, legacy, "기존 미지정 마디의 표시 순서를 보존한다");
  assert.deepEqual((await readHarumadi("maker", "mixed-book")).entryIds, mixed, "수동 위치와 미지정 마디가 섞여 있어도 표시 순서를 보존한다");
  assert.deepEqual((await readHarumadi("maker", "book")).entryIds, ["a", "b"], "수동 정렬은 이전 시 그대로 보존한다");
  await pool.query("INSERT INTO harumadis(id,owner_id) VALUES('append-book','maker'); INSERT INTO harumadi_entry_links(id,harumadi_id,entry_id) VALUES('append-a','append-book','a'),('append-b','append-book','b'),('append-c','append-book','c')");
  assert.deepEqual((await readHarumadi("maker", "append-book")).entryIds, ["a", "b", "c"], "방문 날짜와 무관하게 담은 순서를 사용한다");
  await pool.query("DELETE FROM harumadi_entry_links WHERE id='append-b'; INSERT INTO harumadi_entry_links(id,harumadi_id,entry_id) VALUES('reappend-b','append-book','b')");
  assert.deepEqual((await readHarumadi("maker", "append-book")).entryIds, ["a", "c", "b"], "다시 담은 마디는 맨 뒤에 놓는다");
  await pool.query("INSERT INTO harumadis(id,owner_id) VALUES('concurrent-book','maker')");
  await Promise.all([
    client.harumadiEntryLink.create({ data: { id: "concurrent-a", harumadiId: "concurrent-book", entryId: "a" } }),
    client.harumadiEntryLink.create({ data: { id: "concurrent-b", harumadiId: "concurrent-book", entryId: "b" } }),
  ]);
  const positions = await pool.query("SELECT position FROM harumadi_entry_links WHERE harumadi_id='concurrent-book' ORDER BY position");
  assert.deepEqual(positions.rows.map(r => r.position), [0, 1], "동시 추가도 직렬화해 서로 다른 위치를 부여한다");
  await pool.query("INSERT INTO harumadi_entry_links(id,harumadi_id,entry_id) VALUES('link-c','book','c'); UPDATE harumadis SET revision=revision+1,collaboration_started_at=now() WHERE id='book'");
  assert.deepEqual((await readHarumadi("maker", "book")).entryIds, ["a", "b", "c"]);
  await assert.rejects(reorderHarumadi("maker", "book", { revision: 2, entryIds: ["c", "b", "a"] }), { status: 409 });
  const attempts = await Promise.allSettled([
    reorderHarumadi("maker", "book", { revision: 3, entryIds: ["c", "b", "a"] }),
    reorderHarumadi("maker", "book", { revision: 3, entryIds: ["b", "a", "c"] }),
  ]);
  assert.equal(attempts.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(attempts.filter(r => r.status === "rejected" && r.reason.status === 409).length, 1);
  const ids = await pool.query("SELECT id FROM harumadi_entry_links WHERE harumadi_id='book' ORDER BY id");
  assert.deepEqual(ids.rows.map(r => r.id), ["link-a", "link-b", "link-c"]);
  await assert.rejects(pool.query("UPDATE harumadi_entry_links SET position=-1"));
  console.log(JSON.stringify({ isolatedPostgres: true, ownerOnly: true, ordered: true, newLinksAppended: true, staleRevisionRejected: true, concurrentUpdateProtected: true, linkIdsPreserved: true }));
} finally {
  await client.$disconnect();
  delete (globalThis as { prisma?: unknown }).prisma;
  await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await pool.end();
}
