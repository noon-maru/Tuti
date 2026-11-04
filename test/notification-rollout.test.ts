import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { WEB_PUSH_USER_ENABLED, notificationSettingsAvailable } from "../src/shared/notifications/rollout";

test("웹·PWA 노출은 보류하되 네이티브 알림은 유지한다", () => {
  assert.equal(WEB_PUSH_USER_ENABLED, false);
  assert.equal(notificationSettingsAvailable("native"), true);
  for (const environment of ["checking", "supported", "install-required", "insecure", "unsupported"])
    assert.equal(notificationSettingsAvailable(environment), false);
  for (const file of ["src/features/tuti/flows/SettingsFlow.tsx", "src/features/legal/InitialServiceTermsGate.tsx"])
    assert.match(readFileSync(file, "utf8"), /notificationSettingsAvailable\(/);
  const flow = readFileSync("src/features/tuti/flows/NotificationSettingsFlow.tsx", "utf8");
  assert.match(flow, /!WEB_PUSH_USER_ENABLED && !Capacitor.isNativePlatform\(\)/);
  assert.match(flow, /router.replace\("\/settings"\)/);
});

test("웹 사용자 경로에서는 권한 요청·등록·자동 갱신을 시작하지 않는다", async t => {
  const { Capacitor } = await import("@capacitor/core");
  t.mock.method(Capacitor, "isNativePlatform", () => false);
  t.mock.method(Capacitor, "getPlatform", () => "web");
  t.mock.method(globalThis, "fetch", async () => { throw new Error("웹 보류 중 요청하면 안 됨"); });
  const push = await import("../src/features/tuti/notifications/pushNotifications");
  assert.equal(push.supportsServerPushNotifications(), false);
  assert.deepEqual(await push.getPushNotificationStatus(), { supported: false, permission: "unsupported" });
  assert.deepEqual(await push.enableServerPushNotifications(), { status: "unsupported" });
  assert.equal(await push.syncServerPushRegistration(), false);
});
