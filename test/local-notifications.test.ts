import assert from "node:assert/strict";
import test from "node:test";
import { DAILY_TUTI_NOTIFICATION_ID, disableDailyTutiReminder, supportsLocalNotifications } from "../src/features/tuti/notifications/localNotifications";
import { parseNotificationSettings, DEFAULT_NOTIFICATION_SETTINGS } from "../src/shared/notifications/preferences";

test("일일 알림 시간을 시와 분으로 변환한다", () => {
  for (const time of ["00:00", "10:30", "23:59"]) assert.equal(parseNotificationSettings({ ...DEFAULT_NOTIFICATION_SETTINGS, reminderTime: time })?.reminderTime, time);
});

test("범위를 벗어나거나 형식이 다른 알림 시간을 거부한다", () => {
  for (const value of ["24:00", "10:60", "9:00", "오전 10시", ""]) {
    assert.equal(parseNotificationSettings({ ...DEFAULT_NOTIFICATION_SETTINGS, reminderTime: value }), null);
  }
});

test("웹에서는 구형 로컬 예약 정리가 기기 API를 호출하지 않는다", async () => {
  assert.equal(supportsLocalNotifications(), false);
  assert.equal(DAILY_TUTI_NOTIFICATION_ID, 10001);
  await disableDailyTutiReminder();
});
