import { authenticateAdmin } from "@/server/admin/auth";
import { prisma } from "@/server/db/prisma";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import { isPlatformPushEnabled } from "@/server/notifications/pushAccess";
import { parseFcmPushTestEmails } from "@/server/notifications/pushTestAccess";
import type {
  AdminNotificationDeliveryStatus,
  AdminNotificationErrorSummary,
  AdminNotificationPlatform,
  AdminNotificationPlatformSummary,
  AdminNotificationsResponse,
} from "@/shared/api/admin";

export const runtime = "nodejs";

const platforms = ["android", "ios"] as const;
const statuses = ["sent", "failed", "invalidated"] as const;

export async function GET(request: Request) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json(
      { error: "허용되지 않은 요청 출처예요." },
      { status: 403 },
    );
  }

  const authentication = await authenticateAdmin(request);
  if (!authentication.ok) return withCors(request, authentication.response);

  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim().slice(0, 120) ?? "";
  const requestedPlatform = url.searchParams.get("platform");
  const requestedStatus = url.searchParams.get("status");
  const platform = platforms.includes(
    requestedPlatform as AdminNotificationPlatform,
  )
    ? (requestedPlatform as AdminNotificationPlatform)
    : undefined;
  const status = statuses.includes(
    requestedStatus as AdminNotificationDeliveryStatus,
  )
    ? (requestedStatus as AdminNotificationDeliveryStatus)
    : undefined;
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1_000);
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000);

  const deviceSearch = query
    ? {
        OR: [
          { userId: { contains: query, mode: "insensitive" as const } },
          {
            user: {
              authIdentities: {
                some: { email: { contains: query, mode: "insensitive" as const } },
              },
            },
          },
        ],
      }
    : {};
  const deliverySearch = query
    ? {
        OR: [
          { userId: { contains: query, mode: "insensitive" as const } },
          { errorCode: { contains: query, mode: "insensitive" as const } },
          { messageType: { contains: query, mode: "insensitive" as const } },
          {
            user: {
              authIdentities: {
                some: { email: { contains: query, mode: "insensitive" as const } },
              },
            },
          },
        ],
      }
    : {};

  const [
    allDevices,
    activeUsers,
    deliveries24h,
    lastSent,
    recentFailures,
    devices,
    recent,
  ] = await Promise.all([
    prisma.pushDevice.findMany({
      select: { platform: true, enabled: true, invalidatedAt: true },
    }),
    prisma.pushDevice.findMany({
      where: { enabled: true, invalidatedAt: null },
      select: { userId: true },
      distinct: ["userId"],
    }),
    prisma.pushDelivery.findMany({
      where: { createdAt: { gte: since24h } },
      select: { platform: true, status: true },
    }),
    prisma.pushDelivery.findFirst({
      where: { status: "sent" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.pushDelivery.findMany({
      where: {
        createdAt: { gte: since7d },
        status: { in: ["failed", "invalidated"] },
      },
      orderBy: { createdAt: "desc" },
      select: {
        platform: true,
        errorCode: true,
        createdAt: true,
      },
      take: 1_000,
    }),
    prisma.pushDevice.findMany({
      where: { ...(platform ? { platform } : {}), ...deviceSearch },
      orderBy: { lastSeenAt: "desc" },
      take: 60,
      include: {
        user: {
          select: {
            authIdentities: { select: { email: true }, take: 1 },
          },
        },
      },
    }),
    prisma.pushDelivery.findMany({
      where: {
        ...(platform ? { platform } : {}),
        ...(status ? { status } : {}),
        ...deliverySearch,
      },
      orderBy: { createdAt: "desc" },
      take: 60,
      include: {
        user: {
          select: {
            authIdentities: { select: { email: true }, take: 1 },
          },
        },
        device: { select: { appVersion: true } },
      },
    }),
  ]);

  const platformSummaries: AdminNotificationPlatformSummary[] = platforms.map(
    (currentPlatform) => {
    const platformDevices = allDevices.filter(
      (device) => device.platform === currentPlatform,
    );
    const platformDeliveries = deliveries24h.filter(
      (delivery) => delivery.platform === currentPlatform,
    );

      return {
        platform: currentPlatform,
        activeDevices: platformDevices.filter(
          (device) => device.enabled && !device.invalidatedAt,
        ).length,
        disabledDevices: platformDevices.filter(
          (device) => !device.enabled && !device.invalidatedAt,
        ).length,
        invalidatedDevices: platformDevices.filter((device) =>
          Boolean(device.invalidatedAt),
        ).length,
        sent24h: platformDeliveries.filter(
          (delivery) => delivery.status === "sent",
        ).length,
        failed24h: platformDeliveries.filter(
          (delivery) => delivery.status === "failed",
        ).length,
        invalidated24h: platformDeliveries.filter(
          (delivery) => delivery.status === "invalidated",
        ).length,
        lastSentAt: null,
      };
    },
  );

  for (const summary of platformSummaries) {
    const latest = await prisma.pushDelivery.findFirst({
      where: { platform: summary.platform, status: "sent" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    summary.lastSentAt = latest?.createdAt.toISOString() ?? null;
  }

  const errorsByKey = new Map<string, AdminNotificationErrorSummary>();
  for (const item of recentFailures) {
    const code = item.errorCode ?? "UNKNOWN_ERROR";
    const key = `${item.platform}:${code}`;
    const existing = errorsByKey.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      errorsByKey.set(key, {
        platform: item.platform,
        code,
        count: 1,
        lastOccurredAt: item.createdAt.toISOString(),
      });
    }
  }

  const sent24h = deliveries24h.filter(
    (delivery) => delivery.status === "sent",
  ).length;
  const failed24h = deliveries24h.filter(
    (delivery) => delivery.status !== "sent",
  ).length;
  const attempted24h = sent24h + failed24h;
  const response: AdminNotificationsResponse = {
    generatedAt: new Date().toISOString(),
    configuration: {
      android: {
        enabled: isPlatformPushEnabled("android"),
        testMode:
          !isPlatformPushEnabled("android") &&
          parseFcmPushTestEmails(process.env.FCM_PUSH_TEST_EMAILS).length > 0,
      },
      ios: {
        enabled: isPlatformPushEnabled("ios"),
        testMode:
          !isPlatformPushEnabled("ios") &&
          parseFcmPushTestEmails(process.env.APNS_PUSH_TEST_EMAILS).length > 0,
      },
    },
    summary: {
      totalDevices: allDevices.length,
      activeDevices: allDevices.filter(
        (device) => device.enabled && !device.invalidatedAt,
      ).length,
      activeUsers: activeUsers.length,
      invalidatedDevices: allDevices.filter((device) => device.invalidatedAt)
        .length,
      sent24h,
      failed24h,
      successRate:
        attempted24h === 0 ? null : Math.round((sent24h / attempted24h) * 1_000) / 10,
      lastSentAt: lastSent?.createdAt.toISOString() ?? null,
    },
    platforms: platformSummaries,
    errors: [...errorsByKey.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
    devices: devices.map((device) => ({
      id: device.id,
      userId: device.userId,
      email: device.user.authIdentities[0]?.email ?? null,
      platform: device.platform,
      enabled: device.enabled,
      invalidatedAt: device.invalidatedAt?.toISOString() ?? null,
      appVersion: device.appVersion,
      locale: device.locale,
      lastSeenAt: device.lastSeenAt.toISOString(),
      createdAt: device.createdAt.toISOString(),
    })),
    recent: recent.map((delivery) => ({
      id: delivery.id,
      userId: delivery.userId,
      email: delivery.user?.authIdentities[0]?.email ?? null,
      platform: delivery.platform,
      provider: delivery.provider,
      messageType: delivery.messageType,
      status: delivery.status,
      errorCode: delivery.errorCode,
      errorMessage: delivery.errorMessage,
      createdAt: delivery.createdAt.toISOString(),
      appVersion: delivery.device?.appVersion ?? null,
    })),
  };

  return withCors(request, Response.json(response));
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}
