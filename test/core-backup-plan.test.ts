import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("핵심 백업 제외 후보는 대용량 재수집 자료로 한정하고 사용자·장소·편집 자료는 남긴다", async () => {
  const excluded = (await readFile("scripts/ops/core-backup-excluded-data-tables.txt", "utf8")).trim().split("\n");
  assert.equal(new Set(excluded).size, excluded.length);
  assert.equal(excluded.length, 12);
  for (const name of excluded) assert.match(name, /^[a-z_]+$/);
  for (const name of ["users", "auth_identities", "user_sessions", "journal_entries", "harumadi_pdfs", "places", "tourism_place_source_records", "tourism_place_detail_records", "place_meaning_profiles", "place_visit_time_profiles", "service_terms_acceptances", "location_consent_events", "journal_rights_cases", "journal_rights_notices", "traffic_observations", "admin_journal_access_audits"]) assert.ok(!excluded.includes(name), name);
  const schema = await readFile("prisma/schema.prisma", "utf8");
  for (const name of excluded) assert.ok(schema.includes(`@@map("${name}")`), name);
  const sql = await readFile("scripts/ops/core-backup-scope.sql", "utf8");
  const candidateSection = sql.split("), inventory AS (")[0];
  const sqlExcluded = [...candidateSection.matchAll(/\('([a-z_]+)'\)/g)].map(value => value[1]);
  assert.deepEqual(sqlExcluded, excluded);
});

test("범위 조회는 읽기 전용 트랜잭션·카탈로그만 사용하고 의존 관계를 확인한다", async () => {
  const sql = await readFile("scripts/ops/core-backup-scope.sql", "utf8");
  assert.match(sql, /BEGIN READ ONLY;/);
  assert.match(sql, /ROLLBACK;/);
  assert.match(sql, /pg_constraint/);
  assert.match(sql, /dependencyBlockers/);
  assert.match(sql, /missingPolicyTables/);
  assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|CREATE)\b/i);
  assert.doesNotMatch(sql, /SELECT\s+\*\s+FROM\s+(?:users|journal_entries|harumadi_pdfs)\b/i);
  const wrapper = await readFile("scripts/ops/tuti-core-backup-plan", "utf8");
  assert.equal(spawnSync("sh", ["-n", "scripts/ops/tuti-core-backup-plan"]).status, 0);
  assert.match(wrapper, /exec -T db/);
  assert.doesNotMatch(wrapper, /pg_dump|pg_restore|docker run|compose.*(?:stop|restart|build)/);
});
