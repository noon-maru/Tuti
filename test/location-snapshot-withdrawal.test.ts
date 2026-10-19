import assert from "node:assert/strict";
import test from "node:test";
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/test";
let current = { id: "original", status: "accepted", ageConfirmed: true, termsVersion: "" };
const saved: unknown[] = [];
const operations: string[] = [];
const transaction = {
  $queryRaw: async () => { operations.push("lock"); return [{ id: "subject" }]; },
  locationConsentEvent: { findFirst: async () => { operations.push("consent"); return current; } },
  recommendationRun: { create: async (input: unknown) => { operations.push("save"); saved.push(input); } },
};
(globalThis as { prisma?: unknown }).prisma = { $transaction: async (fn: (tx: typeof transaction) => Promise<unknown>) => fn(transaction) };
const { recordRecommendationRunSafely } = await import("../src/server/recommendations/run");
const { LOCATION_TERMS_VERSION } = await import("../src/shared/location/terms");
const input = { id: "run", userId: "subject", request: {}, places: [], locationUsed: true, locationConsentId: "original", stateTextUsed: false };
test("응답 후 위치 스냅샷 저장은 철회와 같은 잠금 및 동의 세대로 직렬화한다", async () => {
  current.termsVersion = LOCATION_TERMS_VERSION;
  await recordRecommendationRunSafely(input);
  assert.deepEqual(operations, ["lock", "consent", "save"]);
  assert.equal(saved.length, 1);
  current.status = "withdrawn";
  await recordRecommendationRunSafely(input);
  current = { ...current, status: "accepted", id: "reaccepted" };
  await recordRecommendationRunSafely(input);
  await recordRecommendationRunSafely({ ...input, locationConsentId: undefined });
  assert.equal(saved.length, 1);
  await recordRecommendationRunSafely({ ...input, locationUsed: false });
  assert.equal(saved.length, 2);
});
