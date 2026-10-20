import { randomUUID } from "node:crypto";
import { prisma } from "@/server/db/prisma";
import type { PushPlatform } from "@/shared/api/push";
import type { ServerPushMessage } from "@/server/notifications/pushPayload";

type DeliveryStatus = "sent" | "failed" | "invalidated";

export async function recordPushDeliverySafely(input: {
  userId: string;
  deviceId: string | null;
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
        status: input.status,
        errorCode: error.code,
        // 제공자 원문 오류에는 토큰·식별값이 섞일 수 있어 저장하지 않는다.
        errorMessage: null,
      },
    });
  } catch (recordError) {
    console.error("푸시 발송 기록을 저장하지 못했습니다.", {
      error:
        recordError instanceof Error
          ? recordError.name
          : "UnknownError",
      platform: input.platform,
      provider: input.provider,
      status: input.status,
      userId: input.userId,
    });
  }
}

export function normalizePushError(error: unknown, explicitCode?: string) {
  if (!error) {
    return {
      code: explicitCode === "UNREGISTERED_TOKEN" ? explicitCode : null,
      message: null,
    };
  }

  const message =
    error instanceof Error ? error.message : "알 수 없는 발송 오류";
  const httpStatus = message.match(/HTTP\s+(\d{3})/)?.[1];

  return {
    code:
      explicitCode === "UNREGISTERED_TOKEN" ? explicitCode :
      (httpStatus ? `HTTP_${httpStatus}` : "PROVIDER_ERROR"),
    message: null,
  };
}
