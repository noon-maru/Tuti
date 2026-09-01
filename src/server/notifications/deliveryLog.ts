import { randomUUID } from "node:crypto";
import { prisma } from "@/server/db/prisma";
import type { PushPlatform } from "@/shared/api/push";
import type { ServerPushMessage } from "@/server/notifications/pushPayload";

type DeliveryStatus = "sent" | "failed" | "invalidated";

export async function recordPushDeliverySafely(input: {
  userId: string;
  deviceId: string;
  platform: PushPlatform;
  provider: "apns" | "fcm";
  message: ServerPushMessage;
  status: DeliveryStatus;
  error?: unknown;
  errorCode?: string;
}) {
  const error = normalizePushError(input.error, input.errorCode);

  try {
    await prisma.pushDelivery.create({
      data: {
        id: randomUUID(),
        userId: input.userId,
        deviceId: input.deviceId,
        platform: input.platform,
        provider: input.provider,
        messageType: input.message.type.slice(0, 80),
        entityId: input.message.entityId?.slice(0, 160),
        status: input.status,
        errorCode: error.code,
        errorMessage: error.message,
      },
    });
  } catch (recordError) {
    console.error("푸시 발송 기록을 저장하지 못했습니다.", {
      error:
        recordError instanceof Error
          ? recordError.message
          : "UnknownError",
      platform: input.platform,
      provider: input.provider,
      status: input.status,
      userId: input.userId,
    });
  }
}

function normalizePushError(error: unknown, explicitCode?: string) {
  if (!error) {
    return {
      code: explicitCode?.slice(0, 100) || null,
      message: null,
    };
  }

  const message =
    error instanceof Error ? error.message : "알 수 없는 발송 오류";
  const providerCode = message.match(/\(([^()]{1,100})\)/)?.[1];
  const httpStatus = message.match(/HTTP\s+(\d{3})/)?.[1];

  return {
    code:
      explicitCode?.slice(0, 100) ??
      providerCode ??
      (httpStatus ? `HTTP_${httpStatus}` : "PROVIDER_ERROR"),
    message: message.slice(0, 500),
  };
}
