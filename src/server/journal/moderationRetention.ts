import { prisma } from "@/server/db/prisma";
import { journalRightsEnabled } from "@/server/legal/journalRights";

export const JOURNAL_MODERATION_RETENTION_YEARS = 3;

export function getJournalModerationRetentionCutoff(now: Date) {
  const cutoff = new Date(now);
  cutoff.setUTCFullYear(
    cutoff.getUTCFullYear() - JOURNAL_MODERATION_RETENTION_YEARS,
  );
  return cutoff;
}

export async function purgeExpiredJournalModerationRecords(now = new Date()) {
  const cutoff = getJournalModerationRetentionCutoff(now);

  const [reports, systemLogs] = await prisma.$transaction([
    prisma.contentReport.deleteMany({
      where: {
        status: { in: ["resolved", "dismissed"] },
        reviewedAt: { lt: cutoff },
        ...(journalRightsEnabled() ? { OR: [{ rightsCase: null }, { rightsCase: { state: { in: ["closed", "expired"] } } }] } : {}),
      },
    }),
    prisma.systemLog.deleteMany({
      where: {
        category: { in: ["moderation", "report"] },
        createdAt: { lt: cutoff },
      },
    }),
  ]);

  return {
    cutoff: cutoff.toISOString(),
    reports: reports.count,
    systemLogs: systemLogs.count,
  };
}
