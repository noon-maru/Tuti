import { createECDH, createHash } from "node:crypto";
import webPush from "web-push";
import { prisma } from "@/server/db/prisma";
import { parseWebPushSubscription, notificationPath } from "@/shared/notifications/webPush";
import { recordPushDeliverySafely } from "./deliveryLog";
import type { ServerPushMessage } from "./pushPayload";

export const webPushOwnerTag = (owner: string) => createHash("sha256").update(owner).digest("hex");
export const webPushInstallationId = (endpoint: string) => `web_${createHash("sha256").update(endpoint).digest("hex")}`;

export function webPushConfiguration() {
  try {
    if (process.env.WEB_PUSH_ENABLED?.trim().toLowerCase() !== "true") return null;
    const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim() ?? "";
    const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim() ?? "";
    const subject = process.env.WEB_PUSH_VAPID_SUBJECT?.trim() ?? "";
    if (!/^(mailto:[^\s@]+@[^\s@]+|https:\/\/[^\s]+)$/.test(subject)) return null;
    const key = createECDH("prime256v1");
    key.setPrivateKey(Buffer.from(privateKey, "base64url"));
    if (key.getPublicKey().toString("base64url") !== publicKey) return null;
    return { publicKey, privateKey, subject };
  } catch { return null; }
}

export async function sendWebPushToUser(userId: string, message: ServerPushMessage, deliver = webPush.sendNotification) {
  const credentials = webPushConfiguration();
  const counts = { attempted: 0, sent: 0, failed: 0, invalidated: 0 };
  if (!credentials) return counts;
  const devices = await prisma.pushDevice.findMany({ where: { userId, platform: "web", enabled: true, invalidatedAt: null }, select: { id: true, token: true } });
  for (const device of devices) {
    counts.attempted++;
    let status: "sent" | "failed" | "invalidated" = "failed";
    let errorCode: string | undefined;
    try {
      let stored: unknown = null;
      try { stored = JSON.parse(device.token); } catch { /* 손상된 저장값은 재발송하지 않는다. */ }
      const subscription = parseWebPushSubscription(stored);
      if (!subscription) { status = "invalidated"; errorCode = "INVALID_SUBSCRIPTION"; }
      else {
        await deliver(subscription, JSON.stringify({ title: message.title, body: message.body,
          path: notificationPath(message.path, message.notificationId), ownerTag: webPushOwnerTag(userId),
        }), { TTL: 3600, urgency: "normal", timeout: 10_000, vapidDetails: credentials });
        status = "sent";
      }
    } catch (error) {
      const code = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0;
      if (code === 404 || code === 410) status = "invalidated";
      errorCode = code >= 400 && code <= 599 ? `HTTP_${code}` : "PROVIDER_ERROR";
    }
    if (status === "invalidated") {
      counts.invalidated++;
      await prisma.pushDevice.deleteMany({ where: { id: device.id, userId, token: device.token } });
    } else if (status === "sent") counts.sent++; else counts.failed++;
    // 제공자 오류 원문과 URL·구독 키는 로그에 남기지 않는다.
    await recordPushDeliverySafely({ userId, deviceId: status === "invalidated" ? null : device.id, platform: "web", provider: "web-push", message, status, errorCode });
  }
  return counts;
}
