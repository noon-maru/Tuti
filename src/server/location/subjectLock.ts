import type { Prisma } from "@/generated/prisma/client";

// 모든 서버 프로세스에서 철회와 새 이용 기록을 직렬화한다.
// 외부 API 응답을 기다리는 동안 트랜잭션을 유지하지 않는다.
export async function lockLocationSubject(transaction: Prisma.TransactionClient, userId: string) {
  const users = await transaction.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE
  `;
  if (users.length !== 1) throw new Error("Location subject no longer exists");
}
