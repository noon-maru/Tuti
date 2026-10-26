import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/test";
const rows = new Map<string, unknown>();
let failWrite = false;
(globalThis as { prisma?: unknown }).prisma = {
  user: { findUnique: async () => ({ id: "anonymous-test-user", role: "user", displayName: null, lastAccessedAt: new Date(), authIdentities: [] }) },
  systemLog: {
    upsert: async ({ where, create }: { where: { id: string }; create: unknown }) => {
      if (failWrite) throw new Error("test write failed");
      if (!rows.has(where.id)) rows.set(where.id, create);
      return rows.get(where.id);
    },
  },
};
const { POST } = await import("@/app/api/product-interactions/route");
const input = { eventId: "bb17e0d4-d207-4d0e-9bf0-d00604d60e8a", action: "harumadi_purchase_clicked", platform: "web", surface: "welcome" };
function request(body: unknown, authenticated = true, origin = "https://tuti.today") {
  return new Request("https://tuti.today/api/product-interactions", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json", ...(authenticated ? { Authorization: `Bearer ${"a".repeat(40)}` } : {}) },
    body: JSON.stringify(body),
  });
}

test("관심 클릭 API는 인증·출처·입력을 검증하고 재전송만 중복 제거한다", async () => {
  assert.equal((await POST(request(input, false))).status, 401);
  assert.equal((await POST(request(input, true, "https://other.example"))).status, 403);
  assert.equal((await POST(request({ ...input, action: "payment_completed" }))).status, 400);
  assert.equal(rows.size, 0);
  assert.equal((await POST(request(input))).status, 201);
  assert.equal((await POST(request(input))).status, 201);
  assert.equal(rows.size, 1);
  assert.equal((await POST(request({ ...input, eventId: "bb17e0d4-d207-4d0e-9bf0-d00604d60e8b" }))).status, 201);
  assert.equal(rows.size, 2);
  const saved = JSON.stringify([...rows.values()]);
  assert.match(saved, /anonymous-test-user/);
  assert.doesNotMatch(saved, /accessToken|email|photo|userAgent/);
});

test("DB 저장에 실패하면 수집 성공을 반환하지 않는다", async (t) => {
  failWrite = true;
  t.mock.method(console, "error", () => {});
  assert.equal((await POST(request(input))).status, 500);
  failWrite = false;
});
