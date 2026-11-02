import assert from "node:assert/strict";
import test from "node:test";

let role = "admin";
(globalThis as { prisma?: unknown }).prisma = {
  user: { findUnique: async () => ({ id: "operator", role, lastAccessedAt: new Date(),
    authIdentities: [{ id: "identity", provider: "email", email: "operator@example.test" }] }) },
};
const { GET } = await import("../src/app/api/admin/business-metrics/route");
const request = (authenticated = true) => new Request("https://tuti.today/api/admin/business-metrics", {
  headers: authenticated ? { Authorization: `Bearer ${"a".repeat(40)}` } : {},
});

test("옛 추천 중심 지표는 권한 보호 후 종료를 명시하고 새 지표 계약으로 위장하지 않는다", async () => {
  assert.equal((await GET(request(false))).status, 401);
  role = "user";
  assert.equal((await GET(request())).status, 403);
  role = "admin";
  const response = await GET(request());
  assert.equal(response.status, 410);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.match(response.headers.get("link") ?? "", /lifelog-metrics/);
  const body = await response.json();
  assert.equal(body.replacement, "/api/admin/lifelog-metrics");
  assert.equal(body.audience, undefined);
});
