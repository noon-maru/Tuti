"use client";

import { PushNotifications } from "@capacitor/push-notifications";
import type { PluginListenerHandle } from "@capacitor/core";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  supportsServerPushNotifications,
  syncServerPushRegistration,
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
    if (!hasHydrated || !enabled || !supportsServerPushNotifications()) return;

    const sync = () => {
      if (syncInFlight.current) return;
      syncInFlight.current = true;
      void syncServerPushRegistration()
        .catch((error) => {
          console.warn("서버 알림 기기를 동기화하지 못했습니다.", error);
        })
        .finally(() => {
          syncInFlight.current = false;
        });
    };

    sync();
    const unsubscribe = subscribeToSession(sync);
    return () => {
      unsubscribe();
    };
  }, [enabled, hasHydrated]);

  return null;
}
