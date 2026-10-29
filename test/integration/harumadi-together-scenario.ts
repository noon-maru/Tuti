import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/** Only the new private cluster created by legal-postgres.test may call this. */
export function verifyTogetherSchema(query: (sql: string) => string, rejected: (sql: string, message: RegExp) => void, socket: string) {
  assert.ok(socket.includes("tuti-legal-postgres-") && socket.endsWith("/socket"));
  query("CREATE SCHEMA tuti_together_fixture");
  const scoped = (sql: string) => query(`SET search_path = tuti_together_fixture, public; ${sql}`).split("\n").at(-1) ?? "";
  scoped(`
    CREATE TABLE users(id text PRIMARY KEY);
    CREATE TABLE journal_entries(id text PRIMARY KEY, owner_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE);
    CREATE TABLE harumadis(id text PRIMARY KEY, owner_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      revision integer NOT NULL DEFAULT 1, updated_at timestamp(3) NOT NULL DEFAULT now());
    CREATE TABLE harumadi_entry_links(harumadi_id text NOT NULL REFERENCES harumadis(id) ON DELETE CASCADE,
      entry_id text NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE, PRIMARY KEY(harumadi_id, entry_id));
    CREATE TABLE harumadi_pdfs(id text PRIMARY KEY, owner_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE, entry_ids text[] NOT NULL);
    CREATE TABLE content_reports(id text PRIMARY KEY);
  `);
  for (const name of ["20261029150000_harumadi_together", "20261029153000_harumadi_together_reports"]) scoped(readFileSync(`prisma/migrations/${name}/migration.sql`, "utf8"));
  scoped(`
    INSERT INTO users(id) VALUES ('maker'),('a'),('b'),('c');
    INSERT INTO harumadis(id,owner_id) VALUES ('shared','maker'),('private-a','a'),('private-b','b');
    INSERT INTO journal_entries(id,owner_id) VALUES ('a-shared','a'),('a-private','a'),('b-shared','b'),('c-shared','c');
    INSERT INTO harumadi_entry_links(harumadi_id,entry_id) VALUES ('shared','a-shared'),('shared','b-shared'),('shared','c-shared'),('private-a','a-shared'),('private-a','a-private'),('private-b','b-shared');
    INSERT INTO harumadi_members(id,harumadi_id,user_id) VALUES ('member-a','shared','a'),('member-b','shared','b'),('member-c','shared','c');
    INSERT INTO harumadi_comments(id,harumadi_id,author_id,body,updated_at) VALUES ('root','shared','a','synthetic-parent',now());
    INSERT INTO harumadi_comments(id,harumadi_id,author_id,parent_id,body,updated_at) VALUES ('reply','shared','b','root','synthetic-reply',now());
    INSERT INTO harumadi_comments(id,harumadi_id,author_id,body,updated_at) VALUES ('root-c','shared','c','live-until-account-deletion',now());
    INSERT INTO harumadi_comments(id,harumadi_id,author_id,parent_id,body,updated_at) VALUES ('reply-to-c','shared','b','root-c','retained-reply',now());
    INSERT INTO harumadi_pdfs(id,owner_id,entry_ids) VALUES ('saved-by-b','b',ARRAY['a-shared','b-shared','c-shared']);
    INSERT INTO harumadi_invites(id,harumadi_id,token_hash,expires_at) VALUES ('invite','shared','synthetic-token-hash',now()+interval '7 days');
  `);
  assert.equal(scoped("SELECT count(1) FROM harumadi_members WHERE harumadi_id='shared' AND ended_at IS NULL"), "3");
  scoped("DELETE FROM users WHERE id='c'");
  assert.equal(scoped("SELECT count(1) FROM harumadi_comments WHERE id='root-c' AND body='' AND author_id IS NULL AND deleted_at IS NOT NULL"), "1");
  assert.equal(scoped("SELECT body FROM harumadi_comments WHERE id='reply-to-c' AND parent_id='root-c'"), "retained-reply");
  assert.equal(scoped("SELECT count(1) FROM harumadi_pdfs WHERE id='saved-by-b' AND 'c-shared'=ANY(entry_ids)"), "1");
  rejected("SET search_path=tuti_together_fixture,public; INSERT INTO harumadi_members(id,harumadi_id,user_id) VALUES ('duplicate','shared','a')", /unique|duplicate/i);
  rejected("SET search_path=tuti_together_fixture,public; INSERT INTO harumadi_comments(id,harumadi_id,author_id,body,updated_at) VALUES ('too-long','shared','a',repeat('x',1001),now())", /check constraint/i);
  assert.equal(scoped("WITH used AS (UPDATE harumadi_invites SET accepted_at=now(),accepted_by_user_id='a' WHERE id='invite' AND accepted_at IS NULL RETURNING id) SELECT count(1) FROM used"), "1");
  assert.equal(scoped("WITH used AS (UPDATE harumadi_invites SET accepted_at=now(),accepted_by_user_id='b' WHERE id='invite' AND accepted_at IS NULL RETURNING id) SELECT count(1) FROM used"), "0");
  scoped(`
    BEGIN;
    SELECT id FROM harumadis WHERE id='shared' FOR UPDATE;
    DELETE FROM harumadi_entry_links l USING journal_entries e WHERE l.entry_id=e.id AND l.harumadi_id='shared' AND e.owner_id='a';
    UPDATE harumadi_comments SET body='',author_id=NULL,deleted_at=now(),updated_at=now() WHERE harumadi_id='shared' AND author_id='a';
    UPDATE harumadi_members SET ended_at=now() WHERE id='member-a';
    COMMIT;
  `);
  assert.equal(scoped("SELECT count(1) FROM journal_entries WHERE owner_id='a'"), "2");
  assert.equal(scoped("SELECT count(1) FROM harumadi_entry_links WHERE harumadi_id='private-a'"), "2");
  assert.equal(scoped("SELECT count(1) FROM harumadi_entry_links WHERE harumadi_id='shared'"), "1");
  assert.equal(scoped("SELECT body FROM harumadi_comments WHERE id='reply'"), "synthetic-reply");
  scoped("DELETE FROM users WHERE id='a'");
  assert.equal(scoped("SELECT count(1) FROM journal_entries WHERE owner_id='a'"), "0");
  assert.equal(scoped("SELECT count(1) FROM harumadi_comments WHERE id='root' AND body='' AND author_id IS NULL"), "1");
  assert.equal(scoped("SELECT count(1) FROM harumadi_comments WHERE id='reply' AND parent_id='root' AND author_id='b'"), "1");
  assert.equal(scoped("SELECT count(1) FROM harumadi_pdfs WHERE id='saved-by-b' AND 'a-shared'=ANY(entry_ids)"), "1");
  assert.equal(scoped("SELECT count(1) FROM harumadi_invites WHERE accepted_by_user_id IS NULL"), "1");
  scoped("DELETE FROM users WHERE id='maker'");
  assert.equal(scoped("SELECT count(1) FROM harumadis WHERE id='shared'"), "0");
  assert.equal(scoped("SELECT count(1) FROM harumadi_members"), "0");
  assert.equal(scoped("SELECT count(1) FROM harumadi_comments"), "0");
  assert.equal(scoped("SELECT count(1) FROM journal_entries WHERE id='b-shared' AND owner_id='b'"), "1");
  assert.equal(scoped("SELECT count(1) FROM harumadi_pdfs WHERE id='saved-by-b'"), "1");
  query("DROP SCHEMA tuti_together_fixture CASCADE");
}
