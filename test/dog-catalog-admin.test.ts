import assert from "node:assert/strict";
import test from "node:test";

let failLog = false;
let state = { reviewStatus: "pending", isActive: false, visibilityOverride: "auto", catalog: "ready" };
(globalThis as { prisma?: unknown }).prisma = {
  user: { findUnique: async () => ({ id: "operator", role: "admin", lastAccessedAt: new Date(), authIdentities: [{ id: "login", email: "operator@example.test", provider: "email" }] }) },
  $transaction: async (work: (tx: unknown) => Promise<unknown>) => {
    const next = { ...state };
    const result = await work({
      place: {
        update: async ({ data }: { data: Partial<typeof state> }) => { Object.assign(next, data); return { id: "dog", name: "동반 장소", candidateStatus: null, ...next }; },
        updateMany: async ({ data }: { data: Partial<typeof state> }) => { Object.assign(next, data); return { count: 1 }; },
      },
      dogPlaceCatalog: { updateMany: async ({ data }: { data: { status: string } }) => { next.catalog = data.status; return { count: 1 }; } },
      systemLog: { create: async () => { if (failLog) throw Error("LOG_FAILURE"); return {}; } },
    });
    state = next; return result;
  },
};
const { PATCH, POST } = await import("../src/app/api/admin/places/route");
const request = (method: string, data: unknown) => new Request("https://tuti.today/api/admin/places", { method, headers: { Origin: "https://tuti.today", Authorization: `Bearer ${"a".repeat(40)}`, "Content-Type": "application/json" }, body: JSON.stringify(data) });
test("관리자의 허용·숨김은 동반 카탈로그와 감사 로그까지 같은 트랜잭션으로 반영한다", async () => {
  assert.equal((await PATCH(request("PATCH", { placeId: "dog", isActive: false }))).status, 200);
  assert.equal(state.catalog, "excluded"); assert.equal(state.visibilityOverride, "hide");
  assert.equal((await PATCH(request("PATCH", { placeId: "dog", isActive: true }))).status, 200);
  assert.equal(state.catalog, "ready"); assert.equal(state.visibilityOverride, "show");
  assert.equal((await PATCH(request("PATCH", { placeId: "dog", reviewStatus: "pending" }))).status, 200);
  assert.equal(state.catalog, "review_required");
  const before = { ...state }; failLog = true;
  assert.equal((await PATCH(request("PATCH", { placeId: "dog", reviewStatus: "approved" }))).status, 500);
  assert.deepEqual(state, before, "로그 실패는 허용 상태도 롤백");
  failLog = false;
  assert.equal((await POST(request("POST", { action: "bulkReview", placeIds: ["dog"], reviewStatus: "approved" }))).status, 200);
  assert.equal(state.catalog, "ready");
});
