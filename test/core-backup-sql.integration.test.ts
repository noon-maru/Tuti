import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { compareCoreRestore } from "../src/server/legal/coreRestoreComparison";

test("실제 격리 PostgreSQL에서 핵심 덤프·전체 스키마 복원·지문 SQL을 검증한다", { skip: process.env.CORE_BACKUP_SQL_INTEGRATION !== "true", timeout: 60000 }, async t => {
  assert.notEqual(process.getuid?.(), 0);
  const root = await mkdtemp(join(tmpdir(), "tuti-core-sql-"));
  const data = join(root, "data"), socket = join(root, "socket");
  await mkdir(socket, { mode: 0o700 });
  const connection = ["--host", socket, "--port", "15491", "--username", "core_test"];
  const env = { ...process.env, LC_ALL: "C", LANG: "C", PGOPTIONS: "", PGSERVICE: undefined, PGSERVICEFILE: undefined, PGPASSFILE: "/dev/null", PGSSLMODE: "disable" };
  t.after(async () => {
    if (existsSync(join(data, "postmaster.pid"))) {
      const stopped = spawnSync("/usr/bin/pg_ctl", ["-D", data, "-m", "fast", "-w", "-t", "10", "stop"], { env });
      assert.equal(stopped.status, 0, "종료 실패 시 시험 DB를 지우지 않는다.");
    }
    await rm(root, { recursive: true, force: true });
  });
  execFileSync("/usr/bin/initdb", ["-D", data, "-U", "core_test", "--no-locale", "--encoding=UTF8", "--auth-local=trust", "--auth-host=reject"], { env, stdio: "pipe" });
  execFileSync("/usr/bin/pg_ctl", ["-D", data, "-l", join(root, "postgres.log"), "-o", `-k ${socket} -p 15491 -c listen_addresses='' -c shared_buffers=16MB -c max_connections=12 -c max_wal_senders=0`, "-w", "-t", "15", "start"], { env, stdio: "pipe" });
  const sql = (database: string, input: string) => execFileSync("/usr/bin/psql", [...connection, "-d", database, "--no-psqlrc", "-qAt", "-v", "ON_ERROR_STOP=1"], { input, env, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  const policy = (await readFile("scripts/ops/core-backup-excluded-data-tables.txt", "utf8")).trim().split("\n");
  const policyFile = join(root, "excluded.txt"); await writeFile(policyFile, `${policy.join("\n")}\n`);
  const snapshotSql = (await readFile("scripts/ops/core-backup-snapshot.sql", "utf8")).replace("/sandbox-policy/excluded.txt", policyFile.replaceAll("'", "''"));
  sql("postgres", "CREATE DATABASE core_source TEMPLATE template0;");
  sql("core_source", `CREATE TABLE users(id text PRIMARY KEY, note text, settings jsonb);
    CREATE TABLE journal_entries(id text PRIMARY KEY, owner_id text REFERENCES users(id), content text);
    INSERT INTO users VALUES ('fixture', 'synthetic only', '{"a":1,"b":2}');
    INSERT INTO journal_entries VALUES ('fixture-entry', 'fixture', 'synthetic story');
    ${policy.map(name => `CREATE TABLE public.${name}(id int PRIMARY KEY, payload jsonb); INSERT INTO public.${name} VALUES (1, '{"synthetic":true}');`).join("\n")}`);
  const source = JSON.parse(sql("core_source", snapshotSql));
  const productionGuard = await readFile("scripts/ops/core-backup-production-guard.sql", "utf8");
  sql("core_source", productionGuard);
  const dump = join(root, "core.dump");
  execFileSync("/usr/bin/pg_dump", [...connection, "-d", "core_source", "--format=custom", "--no-owner", "--no-privileges", "--file", dump, ...policy.map(name => `--exclude-table-data=public.${name}`)], { env, stdio: "pipe" });
  sql("postgres", "CREATE DATABASE core_restored TEMPLATE template0;");
  for (const section of ["pre-data", "data", "post-data"]) execFileSync("/usr/bin/pg_restore", [...connection, "-d", "core_restored", "--no-owner", "--no-privileges", "--exit-on-error", `--section=${section}`, `--jobs=${section === "pre-data" ? 1 : 2}`, dump], { env, stdio: "pipe" });
  const restored = JSON.parse(sql("core_restored", snapshotSql));
  assert.equal(compareCoreRestore(source, restored, policy).retainedRowsCompared, 2);
  assert.equal(restored.omitted.length, 12);
  assert.ok(restored.omitted.every((item: { rows: number }) => item.rows === 0));
  sql("core_restored", "UPDATE journal_entries SET content = 'synthetic changed';");
  assert.throws(() => compareCoreRestore(source, JSON.parse(sql("core_restored", snapshotSql)), policy), /RETAINED_DATA_MISMATCH/);
  sql("core_source", "CREATE TABLE essential_reference(id int REFERENCES related_tourism_source_records(id));");
  assert.throws(() => sql("core_source", productionGuard), /CORE_DEPENDENCY_BLOCKED/);
  assert.throws(() => sql("core_source", snapshotSql), /CORE_DEPENDENCY_BLOCKED/);
});
