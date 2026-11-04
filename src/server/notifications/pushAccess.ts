import type { PushPlatform } from "@/shared/api/push";

export function isPlatformPushEnabled(platform: PushPlatform) {
  const value =
    platform === "web" ? process.env.WEB_PUSH_ENABLED : platform === "ios"
      ? process.env.APNS_PUSH_ENABLED
      : process.env.FCM_PUSH_ENABLED;
  return value?.trim().toLowerCase() === "true";
}

export async function isPushEnabledForUser(
  _userId: string,
  platform: PushPlatform,
) {
  return isPlatformPushEnabled(platform);
}
