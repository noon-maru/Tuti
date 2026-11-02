import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "../src/generated/prisma/client";

let role = "admin", fail = false, reads = 0;
const engagement = { coverage: { activeUsers: 0, rate: null }, sessions: { meanSeconds: null } };
(globalThis as { prisma?: unknown }).prisma = {
  user: { findUnique: async () => ({ id: "operator", role, lastAccessedAt: new Date(),
    authIdentities: [{ id: "identity", provider: "email", email: "operator@example.test" }] }) },
  $queryRaw: async (sql: Prisma.Sql) => {
    reads++;
    const query = sql.strings.join("?");
    if (query.includes("'coverage'")) {
      if (fail) throw { code: "P2010", meta: { code: "42804", message: "DO-NOT-LOG user@example.test SQL VALUES" } };
      return [{ value: engagement }];
    }
    if (query.includes("'retainedSince'")) return [{ value: null }];
    return [{ madis: 0n, books: 0n, entryDistribution: [] }];
  },
};
const { GET } = await import("../src/app/api/admin/lifelog-metrics/route");
const request = (authenticated = true) => new Request("https://tuti.today/api/admin/lifelog-metrics", {
  headers: authenticated ? { Authorization: `Bearer ${"a".repeat(40)}` } : {},
});

test("라이프로그 지표는 관리자만 조회하며 오류 코드 외 SQL·개인정보를 노출하지 않는다", async t => {
  assert.equal((await GET(request(false))).status, 401);
  role = "user";
  assert.equal((await GET(request())).status, 403);
  assert.equal(reads, 0);
  role = "admin";
  const ok = await GET(request());
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get("cache-control") ?? "", /no-store/);
  assert.deepEqual((await ok.json()).engagement, engagement);
  const logs: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => logs.push(args));
  fail = true;
  const response = await GET(request());
  assert.equal(response.status, 503);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.deepEqual(logs[0], ["라이프로그 지표 조회 실패", { code: "P2010", sqlState: "42804" }]);
  assert.doesNotMatch(JSON.stringify(logs) + JSON.stringify(await response.json()), /DO-NOT-LOG|user@example.test|SQL VALUES/);
});
