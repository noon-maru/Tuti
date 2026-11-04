"use client";

import { PushNotifications } from "@capacitor/push-notifications";
import { App } from "@capacitor/app";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  supportsServerPushNotifications,
  syncServerPushRegistration,
  recoverServerPushPrivacy,
} from "@/features/tuti/notifications/pushNotifications";
import { getSessionSnapshot, subscribeToSession } from "@/lib/auth/session";
import { useTutiStore } from "@/store/tuti";
import { readNotificationSettings, notificationRequest } from "@/lib/notificationSettings";

export function PushNotificationHandler() {
  const router = useRouter();
  const hasHydrated = useTutiStore((state) => state.hasHydrated);
  const syncInFlight = useRef(false);
  const opened = useRef<string | null>(null);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let disposed = false;
    let actionListener: PluginListenerHandle | null = null;

    void PushNotifications.addListener(
      "pushNotificationActionPerformed",
      ({ notification }) => {
        if (disposed) return;
        const path = notification.data?.path;
        const notificationId = notification.data?.notificationId;
        const safe = typeof path === "string" && /^\/(?:harumadi\?|madi\/new\?|inquiry\?)/.test(path) && !path.includes("\\");
        if (typeof notificationId === "string" && notificationId.length <= 200) {
          void notificationRequest("notifications/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notificationId, action: "opened" }) }).catch(() => {});
        }
        router.replace(safe ? `${path}${typeof notificationId === "string" && path.startsWith("/madi/new?") ? `&notificationId=${encodeURIComponent(notificationId)}` : ""}` : "/");
      },
    ).then((listener) => {
      if (disposed) void listener.remove();
      else actionListener = listener;
    });

    return () => {
      disposed = true;
      void actionListener?.remove();
    };
  }, [router]);

  useEffect(() => {
    if (!hasHydrated || !supportsServerPushNotifications()) return;
    let disposed = false;
    let resumeListener: PluginListenerHandle | null = null;

    const sync = () => {
      if (disposed || syncInFlight.current) return;
      syncInFlight.current = true;
      if (!Capacitor.isNativePlatform()) {
        const id = new URLSearchParams(window.location.search).get("notificationId");
        const owner = getSessionSnapshot()?.userId;
        if (owner && id && id.length <= 200 && opened.current !== `${owner}:${id}`) {
          opened.current = `${owner}:${id}`;
          void notificationRequest("notifications/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notificationId: id, action: "opened" }) }, owner).catch(() => { opened.current = null; });
        }
      }
      void recoverServerPushPrivacy()
        .then(async (allowed) => {
          if (disposed || allowed === null) return;
          if (!allowed) return;
          const settings = await readNotificationSettings();
          if (settings.newsEnabled || settings.reminderEnabled) await syncServerPushRegistration();
        })
        .catch((error) => {
          console.warn("서버 알림 기기를 동기화하지 못했습니다.", error);
        })
        .finally(() => {
          syncInFlight.current = false;
        });
    };

    sync();
    const unsubscribe = subscribeToSession(sync);
    window.addEventListener("online", sync);
    const visible = () => { if (document.visibilityState === "visible") sync(); };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("tuti-notification-settings-changed", sync);
    if (Capacitor.isNativePlatform()) void App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) sync();
    }).then((listener) => {
      if (disposed) void listener.remove();
      else resumeListener = listener;
    });
    return () => {
      disposed = true;
      unsubscribe();
      window.removeEventListener("online", sync);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("tuti-notification-settings-changed", sync);
      void resumeListener?.remove();
    };
  }, [hasHydrated]);

  return null;
}
