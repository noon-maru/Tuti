import assert from "node:assert/strict";
import test from "node:test";
import { parseDailyReminderTime } from "../src/features/tuti/notifications/localNotifications";

test("일일 알림 시간을 시와 분으로 변환한다", () => {
  assert.deepEqual(parseDailyReminderTime("00:00"), { hour: 0, minute: 0 });
  assert.deepEqual(parseDailyReminderTime("10:30"), { hour: 10, minute: 30 });
  assert.deepEqual(parseDailyReminderTime("23:59"), { hour: 23, minute: 59 });
});

test("범위를 벗어나거나 형식이 다른 알림 시간을 거부한다", () => {
  for (const value of ["24:00", "10:60", "9:00", "오전 10시", ""]) {
    assert.throws(() => parseDailyReminderTime(value));
  }
});
