import type { Prisma } from "@/generated/prisma/client";
import { AccountAuthError } from "./session";

export const MAX_EMAIL_VERIFICATION_ATTEMPTS = 5;

/** 계정 변경과 같은 트랜잭션에서만 호출한다. 실패하면 코드 소비도 롤백된다. */
export async function consumeEmailChallenge(tx: Pick<Prisma.TransactionClient, "emailVerificationCode">, id: string, now = new Date()) {
  const result = await tx.emailVerificationCode.updateMany({
    where: { id, consumedAt: null, expiresAt: { gt: now }, attempts: { lt: MAX_EMAIL_VERIFICATION_ATTEMPTS } },
    data: { consumedAt: now },
  });
  if (result.count !== 1) throw new AccountAuthError("이미 사용했거나 만료된 인증 요청이에요. 이메일부터 다시 확인해주세요.", "email_code_unavailable", 409);
}

export async function recordFailedEmailAttempt(tx: Pick<Prisma.TransactionClient, "emailVerificationCode">, id: string, now = new Date()) {
  const result = await tx.emailVerificationCode.updateMany({
    where: { id, consumedAt: null, expiresAt: { gt: now }, attempts: { lt: MAX_EMAIL_VERIFICATION_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (result.count !== 1) throw new AccountAuthError("인증 요청이 만료됐거나 입력 횟수를 초과했어요. 다시 요청해주세요.", "email_code_attempts_exceeded", 429);
}
