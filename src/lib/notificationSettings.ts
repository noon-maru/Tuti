import { fetchWithPinnedSession, getSessionSnapshot } from "./auth/session";
import type { NotificationSettings } from "@/shared/notifications/preferences";
export async function notificationRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const owner = getSessionSnapshot()?.userId;
  if (!owner) throw new Error("계정을 확인한 뒤 다시 시도해주세요.");
  const response = await fetchWithPinnedSession(path, { cache: "no-store", ...init }, owner);
  const body = await response.json();
  if (getSessionSnapshot()?.userId !== owner) throw new Error("계정이 바뀌었어요. 다시 확인해주세요.");
  if (!response.ok) throw new Error(body.error ?? "알림 설정을 저장하지 못했어요.");
  return body as T;
}
export const readNotificationSettings = () => notificationRequest<NotificationSettings>("notifications/settings");
export const saveNotificationSettings = (input: NotificationSettings) => notificationRequest<NotificationSettings>("notifications/settings", {
  method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
});
export async function optInInitialNotifications() {
  const { enableServerPushNotifications } = await import("@/features/tuti/notifications/pushNotifications");
  if ((await enableServerPushNotifications()).status !== "registered") return;
  const current = await readNotificationSettings();
  await saveNotificationSettings({ ...current, newsEnabled: true, reminderEnabled: true,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Seoul" });
  window.dispatchEvent(new Event("tuti-notification-settings-changed"));
}
