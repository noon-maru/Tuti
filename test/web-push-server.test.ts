import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import webPush from "web-push";
import { parseWebPushSubscription, notificationPath } from "@/shared/notifications/webPush";

const vapid = webPush.generateVAPIDKeys();
const subscription = { endpoint: "https://fcm.googleapis.com/fcm/send/synthetic-only", keys: { p256dh: vapid.publicKey, auth: randomBytes(16).toString("base64url") } };

test("웹 구독은 HTTPS 푸시 제공자만 허용하고 키·포트·자격 증명·가짜 하위 도메인을 거절한다", () => {
  assert.deepEqual(parseWebPushSubscription(subscription), subscription);
  for (const endpoint of ["https://web.push.apple.com/test", "https://updates.push.services.mozilla.com/wpush/v2/test", "https://wns2.notify.windows.com/test"]) assert.ok(parseWebPushSubscription({ ...subscription, endpoint }));
  for (const endpoint of ["http://fcm.googleapis.com/test", "https://127.0.0.1/test", "https://localhost/test", "https://169.254.169.254/latest", "https://fcm.googleapis.com.evil.test/test", "https://evilnotify.windows.com/test", "https://evil.test/fcm.googleapis.com", "https://user:secret@fcm.googleapis.com/test", "https://fcm.googleapis.com:8443/test", "https://fcm.googleapis.com/test#fragment"]) {
    assert.equal(parseWebPushSubscription({ ...subscription, endpoint }), null, endpoint);
  }
  assert.equal(parseWebPushSubscription({ ...subscription, keys: { ...subscription.keys, auth: "short" } }), null);
  assert.equal(parseWebPushSubscription({ ...subscription, keys: { ...subscription.keys, p256dh: randomBytes(65).fill(0).toString("base64url") } }), null);
  assert.deepEqual(parseWebPushSubscription({ ...subscription, extra: "discard", keys: { ...subscription.keys, auth: subscription.keys.auth + "==", p256dh: subscription.keys.p256dh + "=" } }), subscription);
});

test("웹 알림 클릭 경로는 같은 출처의 정해진 화면만 허용한다", () => {
  for (const path of ["https://evil.test", "//evil.test", "/harumadi?x=1\\evil", "/admin", "/madi/new?x=1\n"]) assert.equal(notificationPath(path), "/");
  assert.equal(notificationPath("/madi/new?from=notification", "a:b"), "/madi/new?from=notification&notificationId=a%3Ab");
});

test("웹 전송은 계정별로 암호화 호출하고 404·410만 제거하며 오류 원문·구독 키를 남기지 않는다", async t => {
  const old = { ...process.env };
  Object.assign(process.env, { WEB_PUSH_ENABLED: "true", WEB_PUSH_VAPID_PUBLIC_KEY: vapid.publicKey, WEB_PUSH_VAPID_PRIVATE_KEY: vapid.privateKey, WEB_PUSH_VAPID_SUBJECT: "mailto:synthetic@example.com" });
  t.after(() => { for (const name of ["WEB_PUSH_ENABLED", "WEB_PUSH_VAPID_PUBLIC_KEY", "WEB_PUSH_VAPID_PRIVATE_KEY", "WEB_PUSH_VAPID_SUBJECT"]) { if (old[name] === undefined) delete process.env[name]; else process.env[name] = old[name]; } });
  const removed: unknown[] = [], logs: unknown[] = [];
  let queries = 0;
  const devices = ["sent", "gone", "missing", "unauthorized", "server", "bad"].map(id => ({ id, token: id === "bad" ? "not-json" : JSON.stringify({ ...subscription, endpoint: subscription.endpoint + id }) }));
  (globalThis as { prisma?: unknown }).prisma = {
    pushDevice: { findMany: async ({ where }: { where: unknown }) => { queries++; assert.deepEqual(where, { userId: "owner", platform: "web", enabled: true, invalidatedAt: null }); return devices; }, deleteMany: async (value: unknown) => { removed.push(value); } },
    pushDelivery: { create: async ({ data }: { data: Record<string, unknown> }) => { logs.push(data); assert.equal(data.errorMessage, null); assert.equal(JSON.stringify(data).includes(subscription.keys.auth), false); } },
  };
  const { sendWebPushToUser, webPushConfiguration, webPushOwnerTag } = await import("@/server/notifications/webPush");
  const result = await sendWebPushToUser("owner", { title: "오늘의 마디", body: "오늘을 남겨볼까요?", path: "/madi/new?from=notification", type: "madi-reminder", notificationId: "synthetic-id", entityId: "must-not-send" }, async (target, payload, options) => {
    assert.equal(options?.TTL, 3600); assert.equal(options?.timeout, 10_000);
    const data = JSON.parse(String(payload));
    assert.equal(data.ownerTag, webPushOwnerTag("owner")); assert.match(data.path, /notificationId=synthetic-id/); assert.equal("entityId" in data, false);
    const code = target.endpoint.endsWith("gone") ? 410 : target.endpoint.endsWith("missing") ? 404 : target.endpoint.endsWith("unauthorized") ? 401 : target.endpoint.endsWith("server") ? 503 : 0;
    if (code) throw { statusCode: code, body: "private-provider-error-must-not-log" };
    return { statusCode: 201, body: "", headers: {} };
  });
  assert.deepEqual(result, { attempted: 6, sent: 1, failed: 2, invalidated: 3 });
  assert.equal(removed.length, 3); assert.equal(logs.length, 6);
  assert.equal(JSON.stringify(logs).includes("private-provider-error"), false);
  process.env.WEB_PUSH_ENABLED = "false";
  assert.equal(webPushConfiguration(), null);
  assert.equal((await sendWebPushToUser("owner", { title: "", body: "", path: "/", type: "test" })).attempted, 0);
  assert.equal(queries, 1);
  process.env.WEB_PUSH_ENABLED = "true"; process.env.WEB_PUSH_VAPID_PRIVATE_KEY = webPush.generateVAPIDKeys().privateKey;
  assert.equal(webPushConfiguration(), null, "공개·개인 키가 다른 설정은 준비 완료로 표시하지 않는다");
});
