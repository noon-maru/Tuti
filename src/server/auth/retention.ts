import { prisma } from "@/server/db/prisma";

const PURGE_INTERVAL_MS = 60 * 60 * 1_000;
const CONSUMED_CODE_GRACE_MS = 60 * 60 * 1_000;

let nextPurgeAt = 0;

export async function purgeExpiredAuthRecords(now = new Date()) {
  const consumedBefore = new Date(now.getTime() - CONSUMED_CODE_GRACE_MS);
  const [sessions, emailCodes, oauthAuthorizations, productActivityEvents] =
    await prisma.$transaction([
      prisma.userSession.deleteMany({
        where: { expiresAt: { lte: now } },
      }),
      prisma.emailVerificationCode.deleteMany({
        where: {
          OR: [
            { expiresAt: { lte: now } },
            { consumedAt: { lte: consumedBefore } },
          ],
        },
      }),
      prisma.oAuthAuthorization.deleteMany({
        where: { expiresAt: { lte: now } },
      }),
      prisma.productActivityEvent.deleteMany({
        where: { retentionUntil: { lte: now } },
      }),
    ]);

  return {
    sessions: sessions.count,
    emailCodes: emailCodes.count,
    oauthAuthorizations: oauthAuthorizations.count,
    productActivityEvents: productActivityEvents.count,
  };
}

export async function purgeExpiredAuthRecordsIfDue(now = new Date()) {
  if (now.getTime() < nextPurgeAt) return null;

  nextPurgeAt = now.getTime() + PURGE_INTERVAL_MS;
  try {
    return await purgeExpiredAuthRecords(now);
  } catch (error) {
    nextPurgeAt = 0;
    console.error("만료된 인증자료를 파기하지 못했습니다.", {
      error: error instanceof Error ? error.name : "UnknownError",
    });
    return null;
  }
}
