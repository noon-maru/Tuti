import { fetchWithPinnedSession, getSessionSnapshot } from "./auth/session";
import type { NotificationSettings } from "@/shared/notifications/preferences";
import { parseNotificationSettings } from "@/shared/notifications/preferences";
import { notificationSettingsKey } from "./optimisticNotificationSettings";
export async function notificationRequest<T>(path: string, init?: RequestInit, ownerId?: string): Promise<T> {
  const owner = ownerId ?? getSessionSnapshot()?.userId;
  if (!owner || getSessionSnapshot()?.userId !== owner) throw new Error("계정을 확인한 뒤 다시 시도해주세요.");
  const response = await fetchWithPinnedSession(path, { cache: "no-store", ...init }, owner);
  const body = await response.json();
  if (getSessionSnapshot()?.userId !== owner) throw new Error("계정이 바뀌었어요. 다시 확인해주세요.");
  if (!response.ok) throw new Error(body.error ?? "알림 설정을 저장하지 못했어요.");
  return body as T;
}
export async function readNotificationSettings(ownerId?: string, signal?: AbortSignal) {
  const value = parseNotificationSettings(await notificationRequest<unknown>("notifications/settings", { signal }, ownerId));
  if (!value) throw new Error("알림 설정을 확인하지 못했어요. 다시 불러와주세요.");
  return value;
}
export const notificationSettingsQuery = (owner: string) => ({
  queryKey: notificationSettingsKey(owner),
  queryFn: ({ signal }: { signal: AbortSignal }) => readNotificationSettings(owner, signal),
  staleTime: 60_000,
  gcTime: 5 * 60_000,
  retry: false as const,
});
export const saveNotificationSettings = (input: NotificationSettings, ownerId?: string) => notificationRequest<NotificationSettings>("notifications/settings", {
  method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
}, ownerId);
export async function optInInitialNotifications(expectedOwner?: string) {
  const owner = getSessionSnapshot()?.userId;
  if (!owner || (expectedOwner && owner !== expectedOwner)) return;
  const current = await readNotificationSettings(owner);
  const { enableServerPushNotifications, disableServerPushNotifications } = await import("@/features/tuti/notifications/pushNotifications");
  if (getSessionSnapshot()?.userId !== owner) return;
  if ((await enableServerPushNotifications()).status !== "registered") return;
  try {
    await saveNotificationSettings({ ...current, newsEnabled: true, reminderEnabled: true,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Seoul" }, owner);
  } catch (error) {
    if (!current.newsEnabled && !current.reminderEnabled && getSessionSnapshot()?.userId === owner) await disableServerPushNotifications().catch(() => {});
    throw error;
  }
  window.dispatchEvent(new Event("tuti-notification-settings-changed"));
}
