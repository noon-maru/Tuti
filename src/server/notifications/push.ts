import { sendIosPushToUser } from "@/server/notifications/apns";
import { sendAndroidPushToUser } from "@/server/notifications/fcm";
import type { ServerPushMessage } from "@/server/notifications/pushPayload";

export async function sendPushToUserSafely(
  userId: string | null,
  message: ServerPushMessage,
) {
  if (!userId) return;

  try {
    await sendPushToUser(userId, message);
  } catch (error) {
    console.error("사용자 푸시 알림을 보내지 못했습니다.", {
      error: error instanceof Error ? error.message : "UnknownError",
      userId,
      type: message.type,
      entityId: message.entityId,
    });
  }
}

export async function sendPushToUser(
  userId: string,
  message: ServerPushMessage,
) {
  const [android, ios] = await Promise.all([
    sendAndroidPushToUser(userId, message),
    sendIosPushToUser(userId, message),
  ]);

  return {
    attempted: android.attempted + ios.attempted,
    sent: android.sent + ios.sent,
    invalidated: android.invalidated + ios.invalidated,
  };
}
