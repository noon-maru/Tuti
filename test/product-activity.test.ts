import assert from "node:assert/strict";
import test from "node:test";
import { normalizeProductActivityInput } from "../src/shared/api/productActivity";

test("허용한 제품 활동과 최소 실행 환경만 정규화한다", () => {
  assert.deepEqual(
    normalizeProductActivityInput({
      clientSessionId: "bb17e0d4-d207-4d0e-9bf0-d00604d60e8a",
      action: "entry_completed",
      platform: "android",
      appVersion: "0.4.0 (7)",
      ipAddress: "192.0.2.1",
      userAgent: "should-not-be-retained",
    }),
    {
      clientSessionId: "bb17e0d4-d207-4d0e-9bf0-d00604d60e8a",
      action: "entry_completed",
      platform: "android",
      appVersion: "0.4.0 (7)",
    },
  );
});

test("임의 활동과 유효하지 않은 세션 식별자를 거부한다", () => {
  assert.equal(
    normalizeProductActivityInput({
      clientSessionId: "not-a-session",
      action: "page_text_copied",
      platform: "web",
    }),
    null,
  );
});
