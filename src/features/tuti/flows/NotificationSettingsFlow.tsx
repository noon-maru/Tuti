"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { NotificationSettingsScreen } from "@/features/tuti/screens/notifications/NotificationSettingsScreen";
import { readNotificationSettings, saveNotificationSettings } from "@/lib/notificationSettings";
import { DEFAULT_NOTIFICATION_SETTINGS, type NotificationSettings } from "@/shared/notifications/preferences";
import { disableDailyTutiReminder } from "../notifications/localNotifications";
import { enableServerPushNotifications, disableServerPushNotifications, getPushNotificationStatus, supportsServerPushNotifications, type PushNotificationStatus } from "../notifications/pushNotifications";
import { subscribeToSession } from "@/lib/auth/session";

export function NotificationSettingsFlow() {
  const router = useRouter();
  const [settings, setSettings] = useState(DEFAULT_NOTIFICATION_SETTINGS);
  const [status, setStatus] = useState<PushNotificationStatus | null>(null);
  const [busy, setBusy] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const saving = useRef(false);
  useEffect(() => {
    let active = true, generation = 0;
    const refresh = () => {
      if (saving.current) return;
      const version = ++generation;
      setLoaded(false); setBusy(true);
      void Promise.all([readNotificationSettings(), getPushNotificationStatus()]).then(([next, permission]) => {
        if (active && version === generation) { setSettings(next); setStatus(permission); setLoaded(true); setMessage(null); }
      }).catch(() => { if (active && version === generation) setMessage("알림 설정을 불러오지 못했어요. 다시 열어주세요."); })
        .finally(() => { if (active && version === generation) setBusy(false); });
    };
    refresh();
    const visible = () => { if (document.visibilityState === "visible") refresh(); };
    const unsubscribe = subscribeToSession(refresh);
    document.addEventListener("visibilitychange", visible);
    return () => { active = false; unsubscribe(); document.removeEventListener("visibilitychange", visible); };
  }, []);
  const change = async (patch: Partial<NotificationSettings>) => {
    if (!loaded || saving.current) return;
    saving.current = true; setBusy(true); setMessage(null);
    try {
      const next = { ...settings, ...patch, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || settings.timeZone };
      if ((patch.newsEnabled === true || patch.reminderEnabled === true) && (await enableServerPushNotifications()).status !== "registered") {
        setMessage("기기 설정에서 Tuti 알림을 허용해주세요."); return;
      }
      const saved = await saveNotificationSettings(next);
      setSettings(saved);
      await disableDailyTutiReminder();
      if (!saved.newsEnabled && !saved.reminderEnabled) await disableServerPushNotifications();
      window.dispatchEvent(new Event("tuti-notification-settings-changed"));
      setMessage("알림 설정을 저장했어요.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "알림 설정을 저장하지 못했어요."); }
    finally { setStatus(await getPushNotificationStatus().catch(() => null)); saving.current = false; setBusy(false); }
  };
  return <NotificationSettingsScreen settings={settings} supported={supportsServerPushNotifications()} status={status} busy={busy || !loaded} message={message}
    onBack={() => router.back()} onChange={change} />;
}
