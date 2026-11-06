import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "../src/generated/prisma/client";
import { consumeEmailChallenge, recordFailedEmailAttempt } from "../src/server/auth/emailChallenge";

test("같은 인증코드의 동시 소비는 한 번만 성공하고 시도 횟수도 초과하지 않는다", async () => {
  let consumed = false, attempts = 0, expired = false;
  const db = { emailVerificationCode: { updateMany: async ({ where, data }: { where: { consumedAt: null; expiresAt: { gt: Date }; attempts: { lt: number } }; data: { consumedAt?: Date } }) => {
    assert.equal(where.consumedAt, null);
    assert.ok(where.expiresAt.gt instanceof Date);
    if (consumed || expired || attempts >= where.attempts.lt) return { count: 0 };
    if (data.consumedAt) consumed = true; else attempts++;
    return { count: 1 };
  } } } as unknown as Prisma.TransactionClient;
  const results = await Promise.allSettled([consumeEmailChallenge(db, "code"), consumeEmailChallenge(db, "code")]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  consumed = false;
  const failures = await Promise.allSettled(Array.from({ length: 10 }, () => recordFailedEmailAttempt(db, "code")));
  assert.equal(failures.filter(r => r.status === "fulfilled").length, 5);
  assert.equal(attempts, 5);
  await assert.rejects(consumeEmailChallenge(db, "code"), { code: "email_code_unavailable" });
  attempts = 0; expired = true;
  await assert.rejects(consumeEmailChallenge(db, "code"), { code: "email_code_unavailable" });
});
