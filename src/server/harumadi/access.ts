import type { Prisma } from "@/generated/prisma/client";
import { HarumadiError } from "./errors";

// New private sharing is opt-in until migration, native links and operational checks complete.
export const harumadiTogetherEnabled = () => process.env.HARUMADI_TOGETHER_ENABLED === "true";
export function requireTogether() {
  if (!harumadiTogetherEnabled()) throw new HarumadiError("함께 채우기를 준비하고 있어요.", 503);
}
export async function lockHarumadi(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM harumadis WHERE id = ${id} FOR UPDATE`;
}
export async function lockSharingSecurity(tx: Prisma.TransactionClient) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('tuti-harumadi-sharing-security', 0))`;
}
export async function requireHarumadiAccess(tx: Prisma.TransactionClient, userId: string, id: string, manage = false) {
  const book = await tx.harumadi.findUnique({ where: { id }, select: {
    id: true, ownerId: true, revision: true, accessRevision: true, collaborationStartedAt: true,
    members: { where: { userId, endedAt: null }, select: { id: true } },
  } });
  if (!book || (book.ownerId !== userId && (!harumadiTogetherEnabled() || manage || !book.members.length))) {
    throw new HarumadiError("이 하루마디에 접근할 수 없어요. 참여 상태를 확인해주세요.", 404);
  }
  return book;
}
export async function requireLinkedAccount(tx: Prisma.TransactionClient, userId: string) {
  if (!await tx.authIdentity.findFirst({ where: { userId }, select: { id: true } })) {
    throw new HarumadiError("로그인한 계정으로 함께 채울 수 있어요.", 403);
  }
}
