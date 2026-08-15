import { prisma } from "../src/server/db/prisma";
import {
  recordLocationSecurityAuditEvent,
} from "../src/server/location/securityAudit";

async function main() {
  const now = new Date();
  const [
    expiredUsageLogs,
    retainedUsageLogs,
    deletedUsageLogs,
    expiredSecurityEvents,
    retainedSecurityEvents,
    deletedSecurityEvents,
  ] = await prisma.$transaction([
    prisma.locationUsageLog.count({
      where: { retentionUntil: { lte: now } },
    }),
    prisma.locationUsageLog.count({
      where: { retentionUntil: { gt: now } },
    }),
    prisma.locationUsageLog.deleteMany({
      where: { retentionUntil: { lte: now } },
    }),
    prisma.locationSecurityAuditEvent.count({
      where: { retentionUntil: { lte: now } },
    }),
    prisma.locationSecurityAuditEvent.count({
      where: { retentionUntil: { gt: now } },
    }),
    prisma.locationSecurityAuditEvent.deleteMany({
      where: { retentionUntil: { lte: now } },
    }),
  ]);
  const auditEvent = await recordLocationSecurityAuditEvent({
    category: "maintenance",
    result: "success",
    actorIdentity: `operator:${process.env.TUTI_OPERATOR_ID ?? "scheduler"}`,
    action: "location-compliance.expired-records-purge",
    resource: process.env.TUTI_INSPECTION_ENV?.trim() || "unknown",
    details: {
      expiredUsageLogs,
      deletedUsageLogs: deletedUsageLogs.count,
      expiredSecurityEvents,
      deletedSecurityEvents: deletedSecurityEvents.count,
    },
  });

  console.log(
    JSON.stringify(
      {
        executedAt: now.toISOString(),
        usageLogs: {
          expiredBeforeRun: expiredUsageLogs,
          deleted: deletedUsageLogs.count,
          retained: retainedUsageLogs,
          policy: "six_months",
        },
        securityEvents: {
          expiredBeforeRun: expiredSecurityEvents,
          deleted: deletedSecurityEvents.count,
          retained: retainedSecurityEvents,
          policy: "one_or_five_years_by_category",
        },
        auditEventId: auditEvent.id,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error("위치정보 이용·제공사실 확인자료를 파기하지 못했습니다.", {
      error: error instanceof Error ? error.name : "UnknownError",
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
