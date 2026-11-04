"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { NotificationSettingsScreen } from "@/features/tuti/screens/notifications/NotificationSettingsScreen";
import { readNotificationSettings, saveNotificationSettings } from "@/lib/notificationSettings";
import { DEFAULT_NOTIFICATION_SETTINGS, type NotificationSettings } from "@/shared/notifications/preferences";
import { disableDailyTutiReminder } from "../notifications/localNotifications";
import { enableServerPushNotifications, disableServerPushNotifications, getPushNotificationStatus, type PushNotificationStatus } from "../notifications/pushNotifications";
import { usePushEnvironment } from "../hooks/usePushEnvironment";
import { getSessionSnapshot, subscribeToSession } from "@/lib/auth/session";
import { WEB_PUSH_USER_ENABLED } from "@/shared/notifications/rollout";
import { Capacitor } from "@capacitor/core";

export function NotificationSettingsFlow() {
  const router = useRouter();
  const [settings, setSettings] = useState(DEFAULT_NOTIFICATION_SETTINGS);
  const [status, setStatus] = useState<PushNotificationStatus | null>(null);
  const pushEnvironment = usePushEnvironment();
  const browser = pushEnvironment === "native" || pushEnvironment === "checking" ? null : pushEnvironment;
  const [busy, setBusy] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const saving = useRef(false);
  const loadedOwner = useRef<string | null>(null);
  const refreshPending = useRef(false);
  useEffect(() => {
    if (!WEB_PUSH_USER_ENABLED && !Capacitor.isNativePlatform()) {
      router.replace("/settings");
      return;
    }
    let active = true, generation = 0;
    const refresh = () => {
      if (saving.current) { refreshPending.current = true; return; }
      const version = ++generation;
      const owner = getSessionSnapshot()?.userId;
      loadedOwner.current = null;
      setLoaded(false); setBusy(true);
      void Promise.all([readNotificationSettings(owner), getPushNotificationStatus()]).then(([next, permission]) => {
        if (active && version === generation) { loadedOwner.current = owner ?? null; setSettings(next); setStatus(permission); setLoaded(true); setMessage(null); }
      }).catch(() => { if (active && version === generation) setMessage("알림 설정을 불러오지 못했어요. 다시 열어주세요."); })
        .finally(() => { if (active && version === generation) setBusy(false); });
    };
    refresh();
    const visible = () => { if (document.visibilityState === "visible") refresh(); };
    const unsubscribe = subscribeToSession(() => { loadedOwner.current = null; setLoaded(false); refresh(); });
    document.addEventListener("visibilitychange", visible);
    return () => { active = false; unsubscribe(); document.removeEventListener("visibilitychange", visible); };
  }, [refreshVersion, router]);
  const change = async (patch: Partial<NotificationSettings>) => {
    const owner = loadedOwner.current;
    if (!loaded || saving.current || !owner || getSessionSnapshot()?.userId !== owner) return;
    saving.current = true; setBusy(true); setMessage(null);
    let registeredHere = false;
    let savedHere = false;
    try {
      const next = { ...settings, ...patch, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || settings.timeZone };
      if (patch.newsEnabled === true || patch.reminderEnabled === true) {
        if ((await enableServerPushNotifications()).status !== "registered") { setMessage(browser ? "브라우저의 사이트 설정에서 Tuti 알림을 허용해주세요." : "기기 설정에서 Tuti 알림을 허용해주세요."); return; }
        registeredHere = true;
      }
      const saved = await saveNotificationSettings(next, owner);
      savedHere = true;
      setSettings(saved);
      await disableDailyTutiReminder();
      if (!saved.newsEnabled && !saved.reminderEnabled && getSessionSnapshot()?.userId === owner) await disableServerPushNotifications();
      window.dispatchEvent(new Event("tuti-notification-settings-changed"));
      setMessage("알림 설정을 저장했어요.");
    } catch (error) {
      if (registeredHere && !savedHere && !settings.newsEnabled && !settings.reminderEnabled && getSessionSnapshot()?.userId === owner) await disableServerPushNotifications().catch(() => {});
      setMessage(error instanceof Error ? error.message : "알림 설정을 저장하지 못했어요.");
    }
    finally {
      setStatus(await getPushNotificationStatus().catch(() => null)); saving.current = false; setBusy(false);
      if (refreshPending.current) { refreshPending.current = false; setRefreshVersion(value => value + 1); }
    }
  };
  if (!WEB_PUSH_USER_ENABLED && pushEnvironment !== "native") return null;
  return <NotificationSettingsScreen settings={settings} supported={status?.supported ?? false} browser={browser} status={status} busy={busy || !loaded} message={message}
    onBack={() => router.back()} onChange={change} />;
}
