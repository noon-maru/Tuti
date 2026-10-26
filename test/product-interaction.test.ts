import assert from "node:assert/strict";
import test from "node:test";
import { normalizeProductInteraction, PRODUCT_INTERACTION_ACTIONS } from "../src/shared/api/productInteraction";

const base = {
  eventId: "bb17e0d4-d207-4d0e-9bf0-d00604d60e8a",
  action: "harumadi_purchase_clicked",
  platform: "web",
  surface: "welcome",
};

test("첫 화면과 구매 관심은 허용한 최소 필드만 수집한다", () => {
  for (const action of PRODUCT_INTERACTION_ACTIONS) {
    assert.deepEqual(normalizeProductInteraction({ ...base, action, email: "private@example.test", photo: "private-photo", price: 30000 }), { ...base, action });
  }
  assert.deepEqual(normalizeProductInteraction({ ...base, surface: "completed_harumadi", platform: "ios" }), { ...base, surface: "completed_harumadi", platform: "ios" });
});

test("임의 이벤트, 잘못된 ID, 플랫폼 및 화면 조합은 거절한다", () => {
  for (const invalid of [null, {}, { ...base, eventId: "wrong" }, { ...base, action: "payment_completed" }, { ...base, platform: "crawler" }, { ...base, surface: "unknown" }, { ...base, action: "welcome_viewed", surface: "completed_harumadi" }]) {
    assert.equal(normalizeProductInteraction(invalid), null);
  }
});
