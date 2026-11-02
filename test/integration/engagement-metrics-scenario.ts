import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Prisma } from "../../src/generated/prisma/client";
import type { EngagementMetrics } from "../../src/shared/api/engagementMetrics";
import { analyticsPeriod } from "../../src/server/admin/analyticsScope";
import { engagementMetricsSql } from "../../src/server/admin/engagementMetrics";

export async function verifyEngagementMetrics(query: (sql: string) => string, socket: string) {
  query("CREATE SCHEMA engagement_fixture");
  const run = (sql: string) => query(`SET search_path=engagement_fixture,public; ${sql}`).replace(/^SET\n/, "");
  const quote = (v: unknown) => v === null ? "NULL" : `'${String(v instanceof Date ? v.toISOString() : v).replace(/'/g, "''")}'`;
  const render = (sql: Prisma.Sql) => sql.strings.map((s, i) => s + (i < sql.values.length ? quote(sql.values[i]) : "")).join("");
  run(`CREATE TABLE users(id text PRIMARY KEY,role text,analytics_excluded_at timestamp);
    CREATE TABLE product_activity_events(user_id text,platform text,app_version text,created_at timestamp,retention_until timestamp);
    INSERT INTO users VALUES('a','user',null),('b','user',null),('c','user',null),('legacy','user',null),('qa','user','2026-10-01'),('admin','admin',null);`);
  run(readFileSync("prisma/migrations/20261030020000_lifelog_events/migration.sql", "utf8"));
  run(readFileSync("prisma/migrations/20261102090000_lifecycle_active_duration/migration.sql", "utf8"));
  let id = 0;
  const event = (owner: string, name: string, at: string, session: string, ms?: number, platform = "web") => {
    const key = `event-${++id}`;
    run(`INSERT INTO lifecycle_events(id,occurrence_key,user_id,name,session_id,platform,app_version,occurred_at,retention_until,active_milliseconds,active_started_at)
      VALUES('${key}','${key}','${owner}','${name}','${session}','${platform}','1.6.2','${at}','2027-01-01',${ms ?? "null"},${ms ? `'${at}'::timestamp-interval '${ms} milliseconds'` : "null"})`);
  };
  event("a", "session_started", "2026-10-01T14:59:50Z", "a1");
  event("a", "home_viewed", "2026-10-01T15:00:05Z", "a1");
  event("a", "session_active", "2026-10-01T15:00:05Z", "a1", 15000);
  event("a", "daily_active", "2026-10-08T01:00:00Z", "a7");
  event("a", "session_started", "2026-10-09T01:00:00Z", "a2");
  event("a", "home_viewed", "2026-10-09T01:00:05Z", "a2");
  event("a", "session_active", "2026-10-09T01:00:05Z", "a2", 5000);
  event("a", "daily_active", "2026-10-31T01:00:00Z", "a30");
  event("c", "session_started", "2026-10-01T14:00:00Z", "c1");
  event("b", "session_started", "2026-11-02T11:55:00Z", "b1", undefined, "android");
  event("b", "session_active", "2026-11-02T11:55:05Z", "b1", 5000, "android");
  event("a", "session_active", "2026-10-29T01:00:00Z", "no-start", 5000);
  for (const owner of ["qa", "admin"]) {
    event(owner, "session_started", "2026-10-01T14:00:00Z", owner);
    event(owner, "session_active", "2026-10-01T14:00:30Z", owner, 30000);
  }
  run("INSERT INTO product_activity_events VALUES('legacy','ios','1.4.0','2026-10-02','2027-01-01')");
  const period = analyticsPeriod(90, new Date("2026-11-02T12:00:00Z"));
  const result = JSON.parse(run(render(engagementMetricsSql(period)))) as EngagementMetrics;
  assert.equal(result.coverage.activeUsers, 4);
  assert.equal(result.coverage.lifecycleUsers, 3);
  assert.equal(result.coverage.legacyOnlyUsers, 1);
  assert.equal(result.coverage.measuredUsers, 2);
  assert.equal(result.coverage.rate, 50);
  assert.equal(result.sessions.measured, 2);
  assert.equal(result.sessions.meanSeconds, 10);
  assert.equal(result.sessions.medianSeconds, 10);
  assert.equal(result.sessions.shortSessions, 1);
  assert.equal(result.sessions.incomplete, 4, "시작 누락 3개와 최근 30분 세션은 평균에서 제외");
  assert.equal(result.distribution[0].sessions, 1);
  for (const row of result.retention) { assert.equal(row.eligible, 2); assert.equal(row.returned, 1); assert.equal(row.pending, 1); assert.equal(row.rate, 50); }
  assert.equal(result.cohorts.find(row => row.day === "2026-10-01")?.users, 2);
  assert.equal(result.cohorts.find(row => row.day === "2026-11-02")?.d1, null);
  assert.equal(result.environments.find(row => row.platform === "ios")?.measuredUsers, 0);
  assert.equal(result.environments.find(row => row.platform === "android")?.meanSeconds, null);
  const { PrismaClient } = await import("../../src/generated/prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const client = new PrismaClient({ adapter: new PrismaPg({ host: socket, port: 15479, user: "tuti_legal_test", database: "postgres", options: "-c search_path=engagement_fixture,public" }, { schema: "engagement_fixture" }) });
  try {
    const [native] = await client.$queryRaw<Array<{ value: EngagementMetrics }>>(engagementMetricsSql(period));
    assert.equal(native.value.sessions.meanSeconds, 10);
    assert.equal(native.value.coverage.activeUsers, 4);
  } finally { await client.$disconnect(); }
  run("DELETE FROM users WHERE id='a'; DELETE FROM product_activity_events; DELETE FROM lifecycle_events");
  const empty = JSON.parse(run(render(engagementMetricsSql(period)))) as EngagementMetrics;
  assert.equal(empty.coverage.rate, null);
  assert.equal(empty.sessions.meanSeconds, null);
  assert.equal(empty.retention[0].rate, null);
  query("DROP SCHEMA engagement_fixture CASCADE");
}
