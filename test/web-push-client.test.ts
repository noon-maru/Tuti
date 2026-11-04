import assert from "node:assert/strict";
import test from "node:test";
import webPush from "web-push";
import { randomBytes } from "node:crypto";
import { Capacitor } from "@capacitor/core";
import { preferencesStorage } from "@/lib/storage/preferencesStorage";
import { ensureSession } from "@/lib/auth/session";

test("웹 등록은 클릭 때만 권한을 요청하고 해제·응답 유실·재등록을 계정에 고정한다", async t => {
  const values = new Map<string, string>([["tuti-session", JSON.stringify({ userId: "web-owner", accessToken: "a".repeat(40) })]]);
  t.mock.method(preferencesStorage, "getItem", async (key: string) => values.get(key) ?? null);
  t.mock.method(preferencesStorage, "setItem", async (key: string, value: string) => { values.set(key, String(value)); });
  t.mock.method(preferencesStorage, "removeItem", async (key: string) => { values.delete(key); });
  t.mock.method(Capacitor, "isNativePlatform", () => false);
  const originals = new Map(["window", "navigator", "Notification", "caches"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  t.after(() => { for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); } });
  const keys = webPush.generateVAPIDKeys();
  const payload = { endpoint: "https://fcm.googleapis.com/fcm/send/synthetic", keys: { p256dh: keys.publicKey, auth: randomBytes(16).toString("base64url") } };
  const metadata = new Map<string, string>();
  let permission: NotificationPermission = "default", requests = 0, registered = false, providerPresent = false, deniedByServer = false;
  const deleted: Record<string, unknown>[] = [];
  const sub = {
    toJSON: () => payload,
    options: { applicationServerKey: Buffer.from(keys.publicKey, "base64url").buffer.slice(Buffer.from(keys.publicKey, "base64url").byteOffset) },
    unsubscribe: async () => { providerPresent = false; return true; },
  };
  const rawKey = Buffer.from(keys.publicKey, "base64url");
  sub.options.applicationServerKey = rawKey.buffer.slice(rawKey.byteOffset, rawKey.byteOffset + rawKey.byteLength);
  const registration = { active: { scriptURL: "https://tuti.today/tuti-push-sw.js" }, getNotifications: async () => [],
    pushManager: { getSubscription: async () => providerPresent ? sub : null, subscribe: async () => { providerPresent = true; return sub; } } };
  const serviceWorker = { getRegistration: async () => registered ? registration : undefined, register: async () => { registered = true; return registration; }, ready: Promise.resolve(registration) };
  const browser = { isSecureContext: true, PushManager: function() {}, Notification: {}, caches: {}, matchMedia: () => ({ matches: false }) };
  const navigatorMock = { userAgent: "Chrome", platform: "Linux", maxTouchPoints: 0, language: "ko-KR", serviceWorker };
  const notification = { get permission() { return permission; }, requestPermission: async () => { requests++; permission = "granted"; return permission; } };
  Object.assign(browser, { Notification: notification });
  for (const [key, value] of Object.entries({ window: browser, navigator: navigatorMock, Notification: notification, caches: {
    open: async () => ({ put: async (key: string, response: Response) => { metadata.set(key, await response.text()); } }),
    delete: async () => { metadata.clear(); return true; },
  } })) Object.defineProperty(globalThis, key, { configurable: true, value });
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
    assert.equal(new Headers(init?.headers).get("Authorization"), `Bearer ${"a".repeat(40)}`);
    if (String(url).endsWith("push/web")) return Response.json({ enabled: true, publicKey: keys.publicKey });
    if (init?.method === "DELETE") { deleted.push(JSON.parse(String(init.body))); return new Response(null, { status: 204 }); }
    assert.ok(requests > 0, "명시적 사용자 동작 전에는 등록하지 않는다");
    if (deniedByServer) return Response.json({ error: "synthetic" }, { status: 503 });
    return Response.json({ registered: true });
  });
  await ensureSession();
  const client = await import("@/features/tuti/notifications/webPushNotifications");
  assert.equal(client.webPushAvailability(), "supported");
  assert.equal(await client.syncWebPushRegistration(), false);
  assert.equal(requests, 0); assert.equal(registered, false);
  const enabling = client.enableWebPushNotifications();
  assert.equal(requests, 1, "권한 요청은 첫 await 이전의 사용자 동작에서 시작한다");
  assert.equal((await enabling).status, "registered");
  assert.equal((await client.getWebPushStatus()).registered, true); assert.equal(metadata.size, 1);
  await client.disableWebPushNotifications();
  assert.equal(providerPresent, false); assert.equal(metadata.size, 0); assert.equal(deleted.length, 1);
  assert.deepEqual(deleted[0].webSubscription, payload);
  deniedByServer = true;
  await assert.rejects(client.enableWebPushNotifications(), /등록하지 못했어요/);
  assert.equal(providerPresent, false); assert.equal(metadata.size, 0);
  deniedByServer = false;
  assert.equal((await client.enableWebPushNotifications()).status, "registered");
  assert.equal(requests, 1, "이미 허용된 권한을 다시 요청하지 않는다");
  permission = "denied";
  assert.equal(await client.syncWebPushRegistration(), false);
  assert.equal(providerPresent, false); assert.equal(metadata.size, 0);
  const deletions = deleted.length;
  await client.prepareWebPushForDeletion("web-owner");
  assert.equal(await client.finishWebPushAfterDeletion(), true);
  assert.equal(deleted.length, deletions, "서버 계정 삭제 성공 뒤 새 세션이나 별도 삭제 요청을 만들지 않는다");
  navigatorMock.userAgent = "iPhone";
  assert.equal(client.webPushAvailability(), "install-required");
  browser.matchMedia = () => ({ matches: true });
  assert.equal(client.webPushAvailability(), "supported");
  browser.isSecureContext = false;
  assert.equal(client.webPushAvailability(), "insecure");
});
