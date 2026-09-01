import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync, verify } from "node:crypto";
import {
  createApnsProviderToken,
  isInvalidApnsTokenResponse,
} from "../src/server/notifications/apns";
import { isInvalidRegistrationError } from "../src/server/notifications/fcmErrors";
import {
  createAndroidFcmMessage,
  createInquiryAnsweredPushMessage,
  createIosApnsPayload,
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

test("문의 답변 푸시를 소리·진동·고우선순위 채널로 전송한다", () => {
  const message = createAndroidFcmMessage(
    "device-token",
    createInquiryAnsweredPushMessage("inquiry-internal-id"),
  );

  assert.equal(message.android.priority, "high");
  assert.equal(
    message.android.notification.channelId,
    "tuti_service_updates_v2",
  );
  assert.equal(
    message.android.notification.notificationPriority,
    "PRIORITY_HIGH",
  );
  assert.equal(message.android.notification.defaultSound, true);
  assert.equal(message.android.notification.defaultVibrateTimings, true);
});

test("FCM 내부 QA 허용 이메일을 정규화하고 중복 제거한다", () => {
  assert.deepEqual(
    parseFcmPushTestEmails(" Admin@Tuti.Today,qa@example.com,admin@tuti.today "),
    ["admin@tuti.today", "qa@example.com"],
  );
  assert.deepEqual(parseFcmPushTestEmails(undefined), []);
});

test("APNs 인증 토큰을 ES256 JWT로 생성한다", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "P-256",
  });
  const token = createApnsProviderToken({
    keyId: "APNSKEY123",
    privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    teamId: "TEAM123456",
    now: 1_788_220_800_000,
  });
  const [header, claims, signature] = token.split(".");

  assert.deepEqual(JSON.parse(Buffer.from(header, "base64url").toString()), {
    alg: "ES256",
    kid: "APNSKEY123",
  });
  assert.deepEqual(JSON.parse(Buffer.from(claims, "base64url").toString()), {
    iss: "TEAM123456",
    iat: 1_788_220_800,
  });
  assert.equal(
    verify(
      "sha256",
      Buffer.from(`${header}.${claims}`),
      { key: publicKey, dsaEncoding: "ieee-p1363" },
      Buffer.from(signature, "base64url"),
    ),
    true,
  );
});

test("iOS 문의 답변 알림은 APNs 표시 데이터와 안전한 이동 경로만 담는다", () => {
  const payload = createIosApnsPayload(
    createInquiryAnsweredPushMessage("inquiry-internal-id"),
  );

  assert.deepEqual(payload.aps.alert, {
    title: "문의에 답변이 도착했어요",
    body: "남겨둔 문의의 답변을 확인해보세요.",
  });
  assert.equal(payload.aps.sound, "default");
  assert.equal(payload.path, "/inquiry?view=history");
  assert.equal("entityId" in payload, false);
});

test("APNs의 만료·불일치 토큰 응답만 기기 무효화로 처리한다", () => {
  assert.equal(isInvalidApnsTokenResponse(410, "Unregistered"), true);
  assert.equal(isInvalidApnsTokenResponse(400, "BadDeviceToken"), true);
  assert.equal(isInvalidApnsTokenResponse(400, "DeviceTokenNotForTopic"), true);
  assert.equal(isInvalidApnsTokenResponse(403, "InvalidProviderToken"), false);
  assert.equal(isInvalidApnsTokenResponse(500, "InternalServerError"), false);
});
