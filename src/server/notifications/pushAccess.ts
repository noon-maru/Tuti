import { prisma } from "@/server/db/prisma";
import { parseFcmPushTestEmails } from "@/server/notifications/pushTestAccess";
import type { PushPlatform } from "@/shared/api/push";

export function isPlatformPushEnabled(platform: PushPlatform) {
  const value =
    platform === "ios"
      ? process.env.APNS_PUSH_ENABLED
      : process.env.FCM_PUSH_ENABLED;
  return value?.trim().toLowerCase() === "true";
}

export async function isPushEnabledForUser(
  userId: string,
  platform: PushPlatform,
) {
  if (isPlatformPushEnabled(platform)) return true;

  const testEmails = parseFcmPushTestEmails(
    platform === "ios"
      ? process.env.APNS_PUSH_TEST_EMAILS
      : process.env.FCM_PUSH_TEST_EMAILS,
  );
  if (testEmails.length === 0) return false;

  const identity = await prisma.authIdentity.findFirst({
    where: {
      userId,
      email: { in: testEmails, mode: "insensitive" },
    },
    select: { id: true },
  });
  return identity !== null;
}
