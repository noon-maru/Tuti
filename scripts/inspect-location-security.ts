import { prisma } from "../src/server/db/prisma";
import {
  recordLocationSecurityAuditEvent,
  verifyLocationSecurityAuditEvents,
} from "../src/server/location/securityAudit";

const now = new Date();
const environment = process.env.TUTI_INSPECTION_ENV?.trim() || "unknown";
const dedicatedAuditSecretLength =
  process.env.LOCATION_AUDIT_HMAC_SECRET?.trim().length ?? 0;
const fallbackAuditSecretLength =
  process.env.AUTH_EMAIL_CODE_SECRET?.trim().length ?? 0;

try {
  const [
    expiredUsageLogs,
    expiredSecurityEvents,
    activeAdmins,
    usageLogCount,
    securityEventCount,
    signatureVerification,
  ] = await Promise.all([
    prisma.locationUsageLog.count({
      where: { retentionUntil: { lte: now } },
    }),
    prisma.locationSecurityAuditEvent.count({
      where: { retentionUntil: { lte: now } },
    }),
    prisma.user.count({ where: { role: "admin" } }),
    prisma.locationUsageLog.count(),
    prisma.locationSecurityAuditEvent.count(),
    verifyLocationSecurityAuditEvents({ take: 100_000 }),
  ]);
  const automatedChecks = {
    auditSigningSecretAvailable:
      dedicatedAuditSecretLength >= 32 || fallbackAuditSecretLength >= 32,
    activeAdministratorExists: activeAdmins > 0,
    usageLogsWithinRetention: expiredUsageLogs === 0,
    securityEventsWithinRetention: expiredSecurityEvents === 0,
    auditSignaturesValid: signatureVerification.invalid === 0,
  };
  const passed = Object.values(automatedChecks).every(Boolean);
  const inspection = await recordLocationSecurityAuditEvent({
    category: "inspection",
    result: passed ? "success" : "failed",
    actorIdentity: `operator:${process.env.TUTI_OPERATOR_ID ?? "scheduler"}`,
    action: "location-security.automated-inspection",
    resource: environment,
    details: {
      activeAdmins,
      usageLogCount,
      securityEventCount,
      expiredUsageLogs,
      expiredSecurityEvents,
      signaturesChecked: signatureVerification.checked,
      invalidSignatures: signatureVerification.invalid,
    },
  });
  const report = {
    environment,
    inspectedAt: now.toISOString(),
    passed,
    automatedChecks,
    counts: {
      activeAdmins,
      usageLogCount,
      securityEventCount,
      expiredUsageLogs,
      expiredSecurityEvents,
    },
    signatureVerification,
    inspectionEventId: inspection.id,
    configuration: {
      dedicatedAuditSecretConfigured: dedicatedAuditSecretLength >= 32,
      usingFallbackSecret:
        dedicatedAuditSecretLength < 32 && fallbackAuditSecretLength >= 32,
    },
    manualChecksRequired: [
      "NAS·Cloudflare·PostgreSQL·Docker 실제 권한자 대조",
      "방화벽·보안 업데이트·악성코드 방지 상태 확인",
      "암호화 백업 및 분기 복원시험 확인",
      "외부 API 계약·약관과 처리 관계 변경 확인",
      "위치정보취급자 교육 및 사고·민원 기록 확인",
    ],
  };
  console.log(JSON.stringify(report, null, 2));
  if (!passed) process.exitCode = 2;
} catch (error) {
  console.error(
    JSON.stringify(
      {
        environment,
        inspectedAt: now.toISOString(),
        passed: false,
        error: error instanceof Error ? error.message : "unknown_error",
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
