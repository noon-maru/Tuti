import type { Prisma } from "@/generated/prisma/client";
import { AccountAuthError } from "./session";

/** 신규 마디·하루마디 작성의 부모 행 잠금과 병합을 직렬화한다. */
export async function lockMergeAccounts(tx: Prisma.TransactionClient, sourceId: string, targetId: string) {
  if (sourceId === targetId) throw new AccountAuthError("서로 다른 계정만 병합할 수 있어요.", "invalid_account_merge", 409);
  // 반대 방향 병합도 동일한 순서로 잠가 교착 가능성을 줄인다.
  const users = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM users WHERE id = ANY(${[sourceId, targetId].sort()}::text[]) ORDER BY id FOR UPDATE
  `;
  if (users.length !== 2) throw new AccountAuthError("계정 상태가 바뀌었어요. 다시 로그인해주세요.", "account_merge_target_missing", 409);
}
