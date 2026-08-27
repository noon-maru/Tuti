"use client";

import { LocalNotifications } from "@capacitor/local-notifications";
import type { PluginListenerHandle } from "@capacitor/core";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  supportsLocalNotifications,
  syncDailyTutiReminder,
} from "@/features/tuti/notifications/localNotifications";
import { useTutiStore } from "@/store/tuti";

export function LocalNotificationHandler() {
  const router = useRouter();
  const hasHydrated = useTutiStore((state) => state.hasHydrated);
  const entryRecord = useTutiStore((state) => state.entryRecord);
  const notificationPreferences = useTutiStore(
    (state) => state.notificationPreferences,
  );
  const requestDailyCheckIn = useTutiStore(
    (state) => state.requestDailyCheckIn,
  );
  const lastSyncedPreference = useRef<string | null>(null);

  useEffect(() => {
    if (!supportsLocalNotifications()) return;

    let disposed = false;
    let listener: PluginListenerHandle | null = null;

    void LocalNotifications.addListener(
      "localNotificationActionPerformed",
      ({ notification }) => {
        if (disposed || notification.extra?.action !== "daily-check-in") {
          return;
        }

        if (entryRecord) {
          requestDailyCheckIn();
          router.replace("/");
          return;
        }

        router.replace("/entry");
      },
    ).then((handle) => {
      if (disposed) {
        void handle.remove();
        return;
      }

      listener = handle;
    });

    return () => {
      disposed = true;
      void listener?.remove();
    };
  }, [entryRecord, requestDailyCheckIn, router]);

  useEffect(() => {
    if (!hasHydrated || !supportsLocalNotifications()) return;

    const preferenceKey = [
      notificationPreferences.dailyReminderEnabled,
      notificationPreferences.dailyReminderTime,
    ].join(":");

    if (lastSyncedPreference.current === preferenceKey) return;
    lastSyncedPreference.current = preferenceKey;

    void syncDailyTutiReminder(
      notificationPreferences.dailyReminderEnabled,
      notificationPreferences.dailyReminderTime,
    ).catch((error) => {
      lastSyncedPreference.current = null;
      console.warn("로컬 알림 예약을 동기화하지 못했습니다.", error);
    });
  }, [hasHydrated, notificationPreferences]);

  return null;
}
