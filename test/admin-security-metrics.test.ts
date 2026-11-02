import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "../src/generated/prisma/client";
import type { AdminSecurityTrafficResponse } from "../src/shared/api/admin";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminSecurityTrafficPanel } from "../src/features/admin/AdminSecurityTrafficPanel";

let role = "admin", reads = 0, lastQuery = "";
(globalThis as { prisma?: unknown }).prisma = {
  user: { findUnique: async () => ({ id: "operator", role, lastAccessedAt: new Date(),
    authIdentities: [{ id: "identity", provider: "email", email: "operator@example.test" }] }) },
  trafficObservation: { findMany: async () => [], aggregate: async () => ({ _min: { firstSeenAt: null } }) },
  trafficBlockRule: { findMany: async () => [] },
  $queryRaw: async (sql: Prisma.Sql) => { reads++; lastQuery = sql.strings.join("?"); return [{ count: 2 }]; },
};
const { GET } = await import("../src/app/api/admin/security-traffic/route");
const request = (authenticated = true) => new Request("https://tuti.today/api/admin/security-traffic?days=7", {
  headers: authenticated ? { Authorization: `Bearer ${"a".repeat(40)}` } : {},
});

test("보안 지표는 관리자만 조회하고 신·구 활동 계정 집계를 사용한다", async () => {
  assert.equal((await GET(request(false))).status, 401);
  role = "user";
  assert.equal((await GET(request())).status, 403);
  assert.equal(reads, 0);
  role = "admin";
  const response = await GET(request());
  assert.equal(response.status, 200);
  const data = await response.json() as AdminSecurityTrafficResponse;
  assert.equal(data.summary.activityConfirmedUsers, 2);
  assert.equal(data.daily.length, 7);
  assert.match(lastQuery, /product_activity_events[\s\S]*UNION[\s\S]*lifecycle_events/);
  assert.match(lastQuery, /retention_until/);
  const html = renderToStaticMarkup(createElement(AdminSecurityTrafficPanel, {
    data, days: 7, mutatingId: null, onDaysChange: () => {}, onBlock: () => {}, onUnblock: () => {},
  }));
  assert.match(html, /활동 확인 계정/);
  assert.doesNotMatch(html, /사람 가능성 높음 <strong[^>]*>0%/);
  assert.match(html, /사람 가능성 높음 <strong[^>]*>—/);
});
