import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_NOTIFICATION_SETTINGS, parseNotificationSettings, notificationLocalClock } from "../src/shared/notifications/preferences";
test("알림은 선택이며 기록 시간 기본값은 19시다", () => {
  assert.deepEqual(DEFAULT_NOTIFICATION_SETTINGS, { newsEnabled: false, reminderEnabled: false, reminderTime: "19:00", timeZone: "Asia/Seoul" });
});
test("설정 시간과 두 수신 선택을 독립적으로 저장한다", () => {
  const input = { ...DEFAULT_NOTIFICATION_SETTINGS, reminderEnabled: true, reminderTime: "20:35" };
  assert.deepEqual(parseNotificationSettings(input), input);
  for (const time of ["7:00","24:00","19:60",""]) assert.equal(parseNotificationSettings({ ...input, reminderTime: time }), null);
  assert.equal(parseNotificationSettings({ ...input, timeZone: "invalid" }), null);
  assert.equal(parseNotificationSettings({ ...input, newsEnabled: "true" }), null);
});
test("알림 날짜는 UTC가 아니라 사용자가 선택한 시간대 기준이다", () => {
  const date = new Date("2026-11-03T10:00:00Z");
  assert.deepEqual(notificationLocalClock(date, "Asia/Seoul"), { day: "2026-11-03", time: "19:00" });
  assert.deepEqual(notificationLocalClock(new Date("2026-11-03T23:30:00Z"), "Asia/Seoul"), { day: "2026-11-04", time: "08:30" });
});
