import { prisma } from "@/server/db/prisma";
import { writeSystemLog } from "@/server/admin/log";
import { enqueueInquiryAnsweredNotification } from "@/server/notifications/outbox";
import { resolveInquiryAnswerState, type InquiryStatusValue } from "./answerState";

export class InquiryWriteError extends Error {
  constructor(message: string, readonly status = 409) { super(message); }
}

export async function answerInquiry(actorId: string, id: string, status: InquiryStatusValue, response: string | undefined, expectedVersion: string) {
  const expected = new Date(expectedVersion);
  if (!Number.isFinite(expected.getTime()) || expected.toISOString() !== expectedVersion) throw new InquiryWriteError("최신 문의를 다시 불러와주세요.", 400);
  return prisma.$transaction(async tx => {
    const previous = await tx.customerInquiry.findUnique({ where: { id }, select: { adminResponse: true, status: true, updatedAt: true } });
    if (!previous) throw new InquiryWriteError("문의를 찾지 못했어요.", 404);
    if (previous.updatedAt.getTime() !== expected.getTime()) throw new InquiryWriteError("다른 관리자가 문의를 수정했어요. 최신 내용을 다시 확인해주세요.");
    const answer = resolveInquiryAnswerState({ requestedStatus: status, submittedResponse: response, previousResponse: previous.adminResponse });
    if (!answer.ok) throw new InquiryWriteError(answer.error, 400);
    const now = new Date(Math.max(Date.now(), expected.getTime() + 1));
    const result = await tx.customerInquiry.updateMany({ where: { id, updatedAt: expected }, data: {
      status: answer.status, adminResponse: answer.adminResponse, handledByUserId: actorId,
      handledAt: answer.status === "pending" ? null : now, updatedAt: now,
    } });
    if (result.count !== 1) throw new InquiryWriteError("다른 관리자가 문의를 수정했어요. 최신 내용을 다시 확인해주세요.");
    const inquiry = await tx.customerInquiry.findUniqueOrThrow({ where: { id }, select: { id: true, status: true, requesterUserId: true } });
    await writeSystemLog({ category: "inquiry", action: "inquiry.updated", message: `1:1 문의 상태를 ${answer.status}(으)로 변경했습니다.`, actorUserId: actorId,
      targetType: "inquiry", targetId: id, metadata: { status: answer.status, hasResponse: Boolean(answer.adminResponse) } }, tx);
    if ((answer.adminResponse && answer.adminResponse !== previous.adminResponse) || (answer.status === "answered" && previous.status !== "answered")) {
      await enqueueInquiryAnsweredNotification(tx, inquiry.requesterUserId, id, now);
    }
    return inquiry;
  });
}
