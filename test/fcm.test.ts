import assert from "node:assert/strict";
import test from "node:test";
import { isInvalidRegistrationError } from "../src/server/notifications/fcmErrors";
import {
  createInquiryAnsweredPushMessage,
  createSafePushData,
} from "../src/server/notifications/pushPayload";
import { parseFcmPushTestEmails } from "../src/server/notifications/pushTestAccess";

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

test("문의 알림은 이용자가 작성한 내용을 메시지에 포함하지 않는다", () => {
  const message = createInquiryAnsweredPushMessage("inquiry-internal-id");

  assert.equal(message.body, "남겨둔 문의의 답변을 확인해보세요.");
  assert.deepEqual(createSafePushData(message), {
    type: "inquiry-answered",
    path: "/inquiry?view=history",
  });
  assert.equal("entityId" in createSafePushData(message), false);
});

test("FCM 내부 QA 허용 이메일을 정규화하고 중복 제거한다", () => {
  assert.deepEqual(
    parseFcmPushTestEmails(" Admin@Tuti.Today,qa@example.com,admin@tuti.today "),
    ["admin@tuti.today", "qa@example.com"],
  );
  assert.deepEqual(parseFcmPushTestEmails(undefined), []);
});
