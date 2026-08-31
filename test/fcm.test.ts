import assert from "node:assert/strict";
import test from "node:test";
import { isInvalidRegistrationError } from "../src/server/notifications/fcmErrors";

test("FCM이 만료된 토큰을 반환하면 기기를 무효화한다", () => {
  assert.equal(isInvalidRegistrationError(404, "UNREGISTERED"), true);
  assert.equal(
    isInvalidRegistrationError(400, "registration-token-not-registered"),
    true,
  );
});

test("인증·서버 오류는 기기 토큰 오류로 간주하지 않는다", () => {
  assert.equal(isInvalidRegistrationError(401, "UNAUTHENTICATED"), false);
  assert.equal(isInvalidRegistrationError(403, "SENDER_ID_MISMATCH"), false);
  assert.equal(isInvalidRegistrationError(500, "INTERNAL"), false);
});
