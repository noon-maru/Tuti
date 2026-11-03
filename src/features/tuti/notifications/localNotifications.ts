import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

// Upgrade cleanup only. Repeating outing notifications must never be rescheduled.
export const DAILY_TUTI_NOTIFICATION_ID = 10_001;
export function supportsLocalNotifications() { return Capacitor.isNativePlatform(); }
export async function disableDailyTutiReminder() {
  if (!supportsLocalNotifications()) return;
  await LocalNotifications.cancel({ notifications: [{ id: DAILY_TUTI_NOTIFICATION_ID }, { id: DAILY_TUTI_NOTIFICATION_ID + 1 }] });
}
