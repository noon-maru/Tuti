"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  disableDailyTutiReminder,
  enableDailyTutiReminder,
  getLocalNotificationStatus,
  scheduleNotificationPreview,
  supportsLocalNotifications,
} from "@/features/tuti/notifications/localNotifications";
import { NotificationSettingsScreen } from "@/features/tuti/screens/notifications/NotificationSettingsScreen";
import { useTutiStore } from "@/store/tuti";
import type { LocalNotificationStatus } from "@/features/tuti/notifications/localNotifications";
import {
  disableServerPushNotifications,
  enableServerPushNotifications,
  getPushNotificationStatus,
  supportsServerPushNotifications,
  type PushNotificationStatus,
} from "@/features/tuti/notifications/pushNotifications";

export function NotificationSettingsFlow() {
  const router = useRouter();
  const preferences = useTutiStore((state) => state.notificationPreferences);
  const setPreferences = useTutiStore(
    (state) => state.setNotificationPreferences,
  );
  const [status, setStatus] = useState<LocalNotificationStatus | null>(() =>
    supportsLocalNotifications()
      ? null
      : { supported: false, permission: "unsupported", scheduled: false },
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pushStatus, setPushStatus] = useState<PushNotificationStatus | null>(
    () =>
      supportsServerPushNotifications()
        ? null
        : { supported: false, permission: "unsupported" },
  );

  const refreshStatus = async () => {
    const nextStatus = await getLocalNotificationStatus();
    setStatus(nextStatus);
    return nextStatus;
  };

  useEffect(() => {
    let disposed = false;

    const refreshVisibleStatus = () => {
      if (document.visibilityState !== "visible") return;

      void Promise.all([
        getLocalNotificationStatus(),
        getPushNotificationStatus(),
      ])
        .then(([nextStatus, nextPushStatus]) => {
          if (!disposed) {
            setStatus(nextStatus);
            setPushStatus(nextPushStatus);
          }
        })
        .catch(() => undefined);
    };

    void Promise.all([
      getLocalNotificationStatus(),
      getPushNotificationStatus(),
    ])
      .then(([nextStatus, nextPushStatus]) => {
        if (!disposed) {
          setStatus(nextStatus);
          setPushStatus(nextPushStatus);
        }
      })
      .catch(() => {
        if (!disposed) {
          setMessage("알림 상태를 확인하지 못했어요. 잠시 후 다시 시도해주세요.");
        }
      });
    window.addEventListener("focus", refreshVisibleStatus);
    document.addEventListener("visibilitychange", refreshVisibleStatus);

    return () => {
      disposed = true;
      window.removeEventListener("focus", refreshVisibleStatus);
      document.removeEventListener("visibilitychange", refreshVisibleStatus);
    };
  }, []);

  const changeInquiryReplyEnabled = async (enabled: boolean) => {
    setBusy(true);
    setMessage(null);

    try {
      if (!enabled) {
        await disableServerPushNotifications();
        setPreferences({ ...preferences, inquiryReplyEnabled: false });
        setMessage("문의 답변 알림을 껐어요.");
      } else {
        const result = await enableServerPushNotifications();
        if (result.status === "registered") {
          setPreferences({ ...preferences, inquiryReplyEnabled: true });
          setMessage("문의에 답변이 오면 알려드릴게요.");
        } else if (result.status === "denied") {
          setMessage("기기에서 알림 권한을 허용해야 답변 알림을 받을 수 있어요.");
        }
      }
      setPushStatus(await getPushNotificationStatus());
    } catch (error) {
      console.warn("문의 답변 알림 설정을 변경하지 못했습니다.", error);
      setMessage("문의 답변 알림을 저장하지 못했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  };

  const changeEnabled = async (enabled: boolean) => {
    setBusy(true);
    setMessage(null);

    try {
      if (!enabled) {
        await disableDailyTutiReminder();
        setPreferences({
          ...preferences,
          dailyReminderEnabled: false,
        });
        setMessage("오늘의 Tuti 알림을 껐어요.");
        await refreshStatus();
        return;
      }

      const result = await enableDailyTutiReminder(
        preferences.dailyReminderTime,
      );

      if (result.status === "scheduled") {
        setPreferences({
          ...preferences,
          dailyReminderEnabled: true,
        });
        setMessage("정해둔 시간에 조용히 알려드릴게요.");
      } else if (result.status === "denied") {
        setMessage("기기에서 알림 권한을 허용해야 알림을 받을 수 있어요.");
      }

      await refreshStatus();
    } catch (error) {
      console.warn("오늘의 Tuti 알림 설정을 변경하지 못했습니다.", error);
      setMessage("알림 설정을 저장하지 못했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  };

  const changeTime = async (time: string) => {
    if (!time) return;

    setBusy(true);
    setMessage(null);

    try {
      if (preferences.dailyReminderEnabled) {
        const result = await enableDailyTutiReminder(time);
        if (result.status !== "scheduled") {
          setMessage("알림 시간을 바꾸지 못했어요. 기기 권한을 확인해주세요.");
          await refreshStatus();
          return;
        }
      }

      setPreferences({
        ...preferences,
        dailyReminderTime: time,
      });
      setMessage(`${formatReminderTime(time)}으로 알림 시간을 바꿨어요.`);
      await refreshStatus();
    } catch (error) {
      console.warn("오늘의 Tuti 알림 시간을 변경하지 못했습니다.", error);
      setMessage("알림 시간을 저장하지 못했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  };

  const preview = async () => {
    setBusy(true);
    setMessage(null);

    try {
      const result = await scheduleNotificationPreview();
      setMessage(
        result.status === "scheduled"
          ? "앱을 잠시 내려두면 5초 뒤 테스트 알림이 도착해요."
          : "기기에서 알림 권한을 허용해주세요.",
      );
      await refreshStatus();
    } catch (error) {
      console.warn("테스트 알림을 예약하지 못했습니다.", error);
      setMessage("테스트 알림을 예약하지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <NotificationSettingsScreen
      enabled={preferences.dailyReminderEnabled}
      time={preferences.dailyReminderTime}
      status={status}
      inquiryReplyEnabled={preferences.inquiryReplyEnabled}
      pushStatus={pushStatus}
      busy={busy}
      message={message}
      onBack={() => router.replace("/")}
      onEnabledChange={changeEnabled}
      onTimeChange={changeTime}
      onPreview={preview}
      onInquiryReplyEnabledChange={changeInquiryReplyEnabled}
    />
  );
}

function formatReminderTime(time: string) {
  const [hourText, minuteText] = time.split(":");
  const hour = Number(hourText);
  const period = hour < 12 ? "오전" : "오후";
  const displayHour = hour % 12 || 12;
  return `${period} ${displayHour}:${minuteText}`;
}
