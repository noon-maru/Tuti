import { sendIosPushToUser } from "@/server/notifications/apns";
import { sendAndroidPushToUser } from "@/server/notifications/fcm";
import type { ServerPushMessage } from "@/server/notifications/pushPayload";
import { readNotificationSettings } from "./settings";

export async function sendPushToUserSafely(
  userId: string | null,
  message: ServerPushMessage,
) {
  if (!userId) return;

  try {
    await sendPushToUser(userId, message);
  } catch (error) {
    console.error("사용자 푸시 알림을 보내지 못했습니다.", {
      error: error instanceof Error ? error.name : "UnknownError",
      type: message.type,
    });
  }
}

export async function sendPushToUser(
  userId: string,
  message: ServerPushMessage,
) {
  const settings = await readNotificationSettings(userId);
  if (message.type === "madi-reminder" ? !settings.reminderEnabled : !settings.newsEnabled) return { attempted: 0, sent: 0, failed: 0, invalidated: 0 };
  const [android, ios] = await Promise.all([
    sendAndroidPushToUser(userId, message),
    sendIosPushToUser(userId, message),
  ]);

  return {
    attempted: android.attempted + ios.attempted,
    sent: android.sent + ios.sent,
    failed: android.failed + ios.failed,
    invalidated: android.invalidated + ios.invalidated,
  };
}
