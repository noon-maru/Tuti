export type NotificationSettings = {
  newsEnabled: boolean;
  reminderEnabled: boolean;
  reminderTime: string;
  timeZone: string;
};
export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  newsEnabled: false, reminderEnabled: false, reminderTime: "19:00", timeZone: "Asia/Seoul",
};
export function parseNotificationSettings(value: unknown): NotificationSettings | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.newsEnabled !== "boolean" || typeof v.reminderEnabled !== "boolean" ||
    typeof v.reminderTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v.reminderTime) ||
    typeof v.timeZone !== "string" || v.timeZone.length > 80) return null;
  try { new Intl.DateTimeFormat("en", { timeZone: v.timeZone }).format(); } catch { return null; }
  return { newsEnabled: v.newsEnabled, reminderEnabled: v.reminderEnabled, reminderTime: v.reminderTime, timeZone: v.timeZone };
}
export function notificationLocalClock(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return { day: `${part("year")}-${part("month")}-${part("day")}`, time: `${part("hour")}:${part("minute")}` };
}
