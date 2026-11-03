import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { preferencesStorage } from "../src/lib/storage/preferencesStorage";
import { ensureSession, getSessionSnapshot, logoutAccount } from "../src/lib/auth/session";
import { notificationRequest, readNotificationSettings, saveNotificationSettings } from "../src/lib/notificationSettings";
import { DEFAULT_NOTIFICATION_SETTINGS } from "../src/shared/notifications/preferences";
test("알림 설정은 권한 요청 전후 계정을 고정하고 다른 계정으로 재전송하지 않는다", async t => {
  const original = { userId: "notification-original", accessToken: "a".repeat(40) };
  const replacement = { userId: "notification-replacement", accessToken: "b".repeat(40) };
  const third = { userId: "notification-third", accessToken: "c".repeat(40) };
  t.mock.method(preferencesStorage, "getItem", async () => JSON.stringify(original));
  t.mock.method(preferencesStorage, "setItem", async () => {});
  t.mock.method(preferencesStorage, "removeItem", async () => {});
  await ensureSession();
  await t.test("조회 후 계정이 바뀌면 이전 화면의 설정은 새 계정에 보내지 않는다", async t => {
    const requests: string[] = [];
    t.mock.method(globalThis, "fetch", async (url: string | URL | Request) => {
      requests.push(String(url));
      return String(url).endsWith("auth/logout") ? Response.json({ session: replacement }) : Response.json(DEFAULT_NOTIFICATION_SETTINGS);
    });
    await readNotificationSettings(original.userId);
    await logoutAccount();
    assert.equal(getSessionSnapshot()?.userId, replacement.userId);
    const before = requests.length;
    await assert.rejects(saveNotificationSettings({ ...DEFAULT_NOTIFICATION_SETTINGS, newsEnabled: true }, original.userId), /계정/);
    assert.equal(requests.length, before);
  });
  await t.test("저장 응답 대기 중 전환된 계정에 이전 응답을 적용하지 않는다", async t => {
    let complete!: (value: Response) => void, started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    t.mock.method(globalThis, "fetch", async (url: string | URL | Request) => {
      if (String(url).endsWith("auth/logout")) return Response.json({ session: third });
      started(); return new Promise<Response>(resolve => { complete = resolve; });
    });
    const pending = saveNotificationSettings(DEFAULT_NOTIFICATION_SETTINGS, replacement.userId);
    await ready; await logoutAccount(); complete(Response.json(DEFAULT_NOTIFICATION_SETTINGS));
    await assert.rejects(pending, /계정/);
    await assert.rejects(notificationRequest("harumadis/book/notifications", { method: "PUT" }, original.userId), /계정/);
  });
  const flow = readFileSync("src/features/tuti/flows/NotificationSettingsFlow.tsx", "utf8");
  assert.match(flow, /saveNotificationSettings\(next, owner\)/);
  assert.match(flow, /registeredHere && !savedHere/);
  assert.match(flow, /refreshPending\.current/);
});
