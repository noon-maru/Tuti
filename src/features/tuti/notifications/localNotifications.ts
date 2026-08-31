import { Capacitor, type PermissionState } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

export const DAILY_TUTI_NOTIFICATION_ID = 10_001;
export const DEFAULT_DAILY_TUTI_TIME = "10:00";
export const DEFAULT_DAILY_NOTIFICATION_STYLE = "quiet";

const LEGACY_DAILY_TUTI_CHANNEL_ID = "daily_tuti";
const DAILY_TUTI_QUIET_CHANNEL_ID = "daily_tuti_quiet_v2";
const DAILY_TUTI_PROMINENT_CHANNEL_ID = "daily_tuti_prominent_v2";

export type DailyNotificationStyle = "quiet" | "prominent";

export type LocalNotificationPermission = PermissionState | "unsupported";

export type LocalNotificationStatus = {
  supported: boolean;
  permission: LocalNotificationPermission;
  scheduled: boolean;
};

export type DailyReminderResult =
  | { status: "scheduled" }
  | { status: "cancelled" }
  | { status: "unsupported" }
  | { status: "denied" };

export function supportsLocalNotifications() {
  return Capacitor.isNativePlatform();
}

export async function getLocalNotificationStatus(): Promise<LocalNotificationStatus> {
  if (!supportsLocalNotifications()) {
    return {
      supported: false,
      permission: "unsupported",
      scheduled: false,
    };
  }

  const [{ display }, pending] = await Promise.all([
    LocalNotifications.checkPermissions(),
    LocalNotifications.getPending(),
  ]);

  return {
    supported: true,
    permission: display,
    scheduled: pending.notifications.some(
      (notification) => notification.id === DAILY_TUTI_NOTIFICATION_ID,
    ),
  };
}

export async function enableDailyTutiReminder(
  time: string,
  style: DailyNotificationStyle = DEFAULT_DAILY_NOTIFICATION_STYLE,
): Promise<DailyReminderResult> {
  if (!supportsLocalNotifications()) {
    return { status: "unsupported" };
  }

  const permission = await ensureNotificationPermission();
  if (permission !== "granted") {
    return { status: "denied" };
  }

  await configureAndroidChannels();
  await scheduleDailyTutiReminder(time, style);
  return { status: "scheduled" };
}

export async function syncDailyTutiReminder(
  enabled: boolean,
  time: string,
  style: DailyNotificationStyle = DEFAULT_DAILY_NOTIFICATION_STYLE,
): Promise<DailyReminderResult> {
  if (!supportsLocalNotifications()) {
    return { status: "unsupported" };
  }

  if (!enabled) {
    await cancelDailyTutiReminder();
    return { status: "cancelled" };
  }

  const { display } = await LocalNotifications.checkPermissions();
  if (display !== "granted") {
    await cancelDailyTutiReminder();
    return { status: "denied" };
  }

  await configureAndroidChannels();
  await scheduleDailyTutiReminder(time, style);
  return { status: "scheduled" };
}

export async function disableDailyTutiReminder(): Promise<DailyReminderResult> {
  if (!supportsLocalNotifications()) {
    return { status: "unsupported" };
  }

  await cancelDailyTutiReminder();
  return { status: "cancelled" };
}

export async function scheduleNotificationPreview(
  style: DailyNotificationStyle = DEFAULT_DAILY_NOTIFICATION_STYLE,
) {
  if (!supportsLocalNotifications()) {
    return { status: "unsupported" } as const;
  }

  const permission = await ensureNotificationPermission();
  if (permission !== "granted") {
    return { status: "denied" } as const;
  }

  await configureAndroidChannels();
  await LocalNotifications.cancel({
    notifications: [{ id: DAILY_TUTI_NOTIFICATION_ID + 1 }],
  });
  await LocalNotifications.schedule({
    notifications: [
      {
        id: DAILY_TUTI_NOTIFICATION_ID + 1,
        title: "오늘의 Tuti",
        body: "오늘은 어떤 공기가 필요할까요?",
        schedule: {
          at: new Date(Date.now() + 5_000),
        },
        ...getNotificationPresentation(style),
        isExactNotification: false,
        extra: {
          action: "daily-check-in",
          path: "/",
        },
      },
    ],
  });

  return { status: "scheduled" } as const;
}

async function ensureNotificationPermission() {
  const current = await LocalNotifications.checkPermissions();
  if (current.display === "granted" || current.display === "denied") {
    return current.display;
  }

  const requested = await LocalNotifications.requestPermissions();
  return requested.display;
}

async function configureAndroidChannels() {
  if (Capacitor.getPlatform() !== "android") return;

  await LocalNotifications.createChannel({
    id: DAILY_TUTI_QUIET_CHANNEL_ID,
    name: "오늘의 Tuti · 조용히",
    description: "소리와 진동 없이 오늘 가능한 상태와 공간을 알려드려요.",
    importance: 3,
    visibility: 1,
    vibration: false,
    lights: true,
    lightColor: "#C7EA86",
  });
  await LocalNotifications.createChannel({
    id: DAILY_TUTI_PROMINENT_CHANNEL_ID,
    name: "오늘의 Tuti · 팝업",
    description: "화면 상단 팝업과 진동으로 오늘의 Tuti를 알려드려요.",
    importance: 4,
    visibility: 1,
    vibration: true,
    lights: true,
    lightColor: "#C7EA86",
  });
  await LocalNotifications.deleteChannel({
    id: LEGACY_DAILY_TUTI_CHANNEL_ID,
  }).catch(() => undefined);
}

async function scheduleDailyTutiReminder(
  time: string,
  style: DailyNotificationStyle,
) {
  const { hour, minute } = parseDailyReminderTime(time);

  await cancelDailyTutiReminder();
  await LocalNotifications.schedule({
    notifications: [
      {
        id: DAILY_TUTI_NOTIFICATION_ID,
        title: "오늘의 Tuti",
        body: "오늘은 어떤 공기가 필요할까요?",
        schedule: {
          on: { hour, minute },
        },
        ...getNotificationPresentation(style),
        isExactNotification: false,
        extra: {
          action: "daily-check-in",
          path: "/",
        },
      },
    ],
  });
}

function getNotificationPresentation(style: DailyNotificationStyle) {
  if (style === "prominent") {
    return {
      channelId: DAILY_TUTI_PROMINENT_CHANNEL_ID,
      foreground: true,
      interruptionLevel: "active" as const,
      sound: "default",
    };
  }

  return {
    channelId: DAILY_TUTI_QUIET_CHANNEL_ID,
    foreground: false,
    interruptionLevel: "passive" as const,
    silent: true,
  };
}

export function normalizeDailyNotificationStyle(
  style: unknown,
): DailyNotificationStyle {
  return style === "prominent" ? "prominent" : "quiet";
}

async function cancelDailyTutiReminder() {
  await LocalNotifications.cancel({
    notifications: [
      { id: DAILY_TUTI_NOTIFICATION_ID },
      { id: DAILY_TUTI_NOTIFICATION_ID + 1 },
    ],
  });
}

export function parseDailyReminderTime(time: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  const hour = Number(match?.[1]);
  const minute = Number(match?.[2]);

  if (
    !match ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    throw new Error(`올바르지 않은 알림 시간입니다: ${time}`);
  }

  return { hour, minute };
}
