"use client";

import { PushNotifications } from "@capacitor/push-notifications";
import { App } from "@capacitor/app";
import type { PluginListenerHandle } from "@capacitor/core";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  supportsServerPushNotifications,
  syncServerPushRegistration,
  recoverServerPushPrivacy,
} from "@/features/tuti/notifications/pushNotifications";
import { subscribeToSession } from "@/lib/auth/session";
import { useTutiStore } from "@/store/tuti";

export function PushNotificationHandler() {
  const router = useRouter();
  const hasHydrated = useTutiStore((state) => state.hasHydrated);
  const enabled = useTutiStore(
    (state) => state.notificationPreferences.inquiryReplyEnabled,
  );
  const syncInFlight = useRef(false);

  useEffect(() => {
    if (!supportsServerPushNotifications()) return;

    let disposed = false;
    let actionListener: PluginListenerHandle | null = null;

    void PushNotifications.addListener(
      "pushNotificationActionPerformed",
      ({ notification }) => {
        if (disposed) return;
        const path = notification.data?.path;
        router.replace(typeof path === "string" && path.startsWith("/") ? path : "/");
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
      void recoverServerPushPrivacy()
        .then(async (allowed) => {
          if (disposed || allowed === null) return;
          if (!allowed) {
            const store = useTutiStore.getState();
            if (store.notificationPreferences.inquiryReplyEnabled) {
              store.setNotificationPreferences({ ...store.notificationPreferences, inquiryReplyEnabled: false });
            }
            return;
          }
          if (enabled && (await syncServerPushRegistration()) === false) {
            const store = useTutiStore.getState();
            store.setNotificationPreferences({ ...store.notificationPreferences, inquiryReplyEnabled: false });
          }
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
    void App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) sync();
    }).then((listener) => {
      if (disposed) void listener.remove();
      else resumeListener = listener;
    });
    return () => {
      disposed = true;
      unsubscribe();
      window.removeEventListener("online", sync);
      void resumeListener?.remove();
    };
  }, [enabled, hasHydrated]);

  return null;
}
