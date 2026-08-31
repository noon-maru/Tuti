import { TUTI_SERVICE_PUSH_CHANNEL_ID } from "@/shared/notifications/pushChannel";

export type SafePushData = {
  type: string;
  path: string;
};

export type ServerPushMessage = SafePushData & {
  title: string;
  body: string;
  entityId?: string;
};

export function createSafePushData(message: SafePushData) {
  return {
    type: message.type,
    path: message.path,
  };
}

export function createAndroidFcmMessage(
  token: string,
  message: ServerPushMessage,
) {
  return {
    token,
    notification: {
      title: message.title,
      body: message.body,
    },
    data: createSafePushData(message),
    android: {
      priority: "high",
      notification: {
        channelId: TUTI_SERVICE_PUSH_CHANNEL_ID,
        icon: "tuti_notification_icon",
        color: "#8CBDEF",
        notificationPriority: "PRIORITY_HIGH",
        defaultSound: true,
        defaultVibrateTimings: true,
      },
    },
  } as const;
}

export function createInquiryAnsweredPushMessage(inquiryId: string) {
  return {
    title: "문의에 답변이 도착했어요",
    body: "남겨둔 문의의 답변을 확인해보세요.",
    type: "inquiry-answered",
    path: "/inquiry?view=history",
    entityId: inquiryId,
  } as const;
}
