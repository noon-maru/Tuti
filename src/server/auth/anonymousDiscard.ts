import type { Prisma } from "@/generated/prisma/client";
import { lockMergeAccounts } from "./mergeLock";
import { AccountAuthError } from "./session";

/** 삭제 판단과 신규 작성이 같은 부모 행 잠금을 사용해야 한다. */
export async function lockAnonymousDiscard(tx: Prisma.TransactionClient, sourceId: string, targetId: string, confirmedDiscard: boolean) {
  await lockMergeAccounts(tx, sourceId, targetId);
  if (await tx.authIdentity.count({ where: { userId: sourceId } })) {
    throw new AccountAuthError("다른 화면에서 로그인 상태가 바뀌었어요. 다시 확인해주세요.", "account_merge_source_changed", 409);
  }
  if (!confirmedDiscard) {
    const counts = await Promise.all([
      tx.journalEntry.count({ where: { ownerId: sourceId } }),
      tx.harumadi.count({ where: { ownerId: sourceId } }),
      tx.harumadiPdf.count({ where: { ownerId: sourceId } }),
    ]);
    if (counts.some(count => count > 0)) throw new AccountAuthError("다른 화면에서 기록이 추가됐어요. 로그인 전에 기록을 합칠지 다시 선택해주세요.", "account_discard_content_changed", 409);
  }
}
