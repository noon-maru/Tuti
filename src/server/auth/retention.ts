import { prisma } from "@/server/db/prisma";
import { adminJournalAccessAuditCutoff, LEGACY_ADMIN_JOURNAL_ACCESS_AUDIT } from "@/server/admin/journalAccessAudit";

const PURGE_INTERVAL_MS = 60 * 60 * 1_000;
const CONSUMED_CODE_GRACE_MS = 60 * 60 * 1_000;

let nextPurgeAt = 0;

export async function purgeExpiredAuthRecords(now = new Date()) {
  const consumedBefore = new Date(now.getTime() - CONSUMED_CODE_GRACE_MS);
  const securityRuleHistoryBefore = new Date(
    now.getTime() - 90 * 24 * 60 * 60 * 1_000,
  );
  const productInteractionBefore = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1_000);
  const [
    sessions,
    emailCodes,
    oauthAuthorizations,
    productActivityEvents,
    trafficObservations,
    trafficBlockRules,
    trafficSecurityLogs,
    adminJournalAccessAudits,
    legacyAdminJournalAccessLogs,
    productInteractions,
    lifecycleEvents,
  ] =
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
      prisma.trafficObservation.deleteMany({
        where: { retentionUntil: { lte: now } },
      }),
      prisma.trafficBlockRule.deleteMany({
        where: {
          OR: [
            { revokedAt: { lte: securityRuleHistoryBefore } },
            {
              revokedAt: null,
              expiresAt: { lte: securityRuleHistoryBefore },
            },
          ],
        },
      }),
      prisma.systemLog.deleteMany({
        where: {
          category: "security",
          action: { in: ["traffic.block.created", "traffic.block.revoked"] },
          createdAt: { lte: securityRuleHistoryBefore },
        },
      }),
      prisma.adminJournalAccessAudit.deleteMany({
        where: { occurredAt: { lt: adminJournalAccessAuditCutoff(now) } },
      }),
      prisma.systemLog.deleteMany({
        where: { ...LEGACY_ADMIN_JOURNAL_ACCESS_AUDIT, createdAt: { lt: adminJournalAccessAuditCutoff(now) } },
      }),
      prisma.systemLog.deleteMany({
        where: { category: "product", createdAt: { lte: productInteractionBefore } },
      }),
      prisma.lifecycleEvent.deleteMany({ where: { retentionUntil: { lte: now } } }),
    ]);

  return {
    sessions: sessions.count,
    emailCodes: emailCodes.count,
    oauthAuthorizations: oauthAuthorizations.count,
    productActivityEvents: productActivityEvents.count,
    trafficObservations: trafficObservations.count,
    trafficBlockRules: trafficBlockRules.count,
    trafficSecurityLogs: trafficSecurityLogs.count,
    adminJournalAccessAudits: adminJournalAccessAudits.count,
    legacyAdminJournalAccessLogs: legacyAdminJournalAccessLogs.count,
    productInteractions: productInteractions.count,
    lifecycleEvents: lifecycleEvents.count,
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
