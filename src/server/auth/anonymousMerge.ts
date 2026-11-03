import type { Prisma } from "@/generated/prisma/client";
import { mergeTogether } from "@/server/harumadi/merge";

/** 인증 트랜잭션 안에서 호출한다. 임시 계정 삭제는 모든 이전이 끝난 뒤 수행한다. */
export async function transferAnonymousData(
  tx: Prisma.TransactionClient,
  sourceId: string,
  targetId: string,
) {
  await tx.journalEntry.updateMany({
    where: { ownerId: sourceId }, data: { ownerId: targetId },
  });
  // 마디뿐 아니라 하루마디 소유권도 옮겨야 임시 계정 삭제 시 연쇄 삭제되지 않는다.
  // 책 ID·표지·마디 연결·배치 순서·PDF 객체 키는 그대로 유지한다.
  await tx.harumadi.updateMany({
    where: { ownerId: sourceId },
    data: { ownerId: targetId, accessRevision: { increment: 1 } },
  });
  await tx.harumadiPdf.updateMany({
    where: { ownerId: sourceId }, data: { ownerId: targetId },
  });
  await mergeTogether(tx, sourceId, targetId);
  await tx.journalShareTrace.updateMany({
    where: { resolvedUserId: sourceId }, data: { resolvedUserId: targetId },
  });
  await tx.customerInquiry.updateMany({
    where: { requesterUserId: sourceId }, data: { requesterUserId: targetId },
  });
  // 명시적으로 병합한 행동만 이전하며 동의 상태는 복사하지 않는다.
  await tx.recommendationAction.updateMany({
    where: { userId: sourceId }, data: { userId: targetId },
  });
  await tx.recommendationRun.updateMany({
    where: { userId: sourceId }, data: { userId: targetId },
  });
  await tx.productActivityEvent.updateMany({
    where: { userId: sourceId }, data: { userId: targetId },
  });
  await tx.locationUsageLog.updateMany({
    where: { userId: sourceId }, data: { userId: targetId },
  });
  await tx.userSignalProfile.deleteMany({ where: { userId: sourceId } });
  await tx.user.delete({ where: { id: sourceId } });
}
