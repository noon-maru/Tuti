export type SafePushData = {
  type: string;
  path: string;
};

export function createSafePushData(message: SafePushData) {
  return {
    type: message.type,
    path: message.path,
  };
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
