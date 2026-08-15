import { authenticateAdmin } from "@/server/admin/auth";
import { prisma } from "@/server/db/prisma";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import type { AdminOverviewResponse } from "@/shared/api/admin";
import { getExternalLocationProcessingMode } from "@/server/location/externalProcessing";
import { LOCATION_TERMS_VERSION } from "@/shared/location/terms";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json({ error: "허용되지 않은 요청 출처예요." }, { status: 403 });
  }

  const authentication = await authenticateAdmin(request);

  if (!authentication.ok) {
    return withCors(request, authentication.response);
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const sevenDaysFromNow = new Date();
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

  const [
    users,
    admins,
    activePlaces,
    pendingPlaces,
    pendingReports,
    pendingInquiries,
    logsToday,
    activeConsentRows,
    locationUsageLogsToday,
    externalTransfersToday,
    expiringWithinSevenDays,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: "admin" } }),
    prisma.place.count({
      where: { isActive: true, reviewStatus: "approved" },
    }),
    prisma.place.count({ where: { reviewStatus: "pending" } }),
    prisma.contentReport.count({
      where: { status: { in: ["pending", "reviewing"] } },
    }),
    prisma.customerInquiry.count({
      where: { status: { in: ["pending", "reviewing"] } },
    }),
    prisma.systemLog.count({ where: { createdAt: { gte: startOfToday } } }),
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS "count"
      FROM (
        SELECT DISTINCT ON ("subject_key")
          "status", "terms_version", "age_confirmed"
        FROM "location_consent_events"
        ORDER BY "subject_key", "created_at" DESC, "id" DESC
      ) AS latest
      WHERE
        latest."status" = 'accepted'::"LocationConsentStatus"
        AND latest."terms_version" = ${LOCATION_TERMS_VERSION}
        AND latest."age_confirmed" = true
    `,
    prisma.locationUsageLog.count({
      where: { occurredAt: { gte: startOfToday } },
    }),
    prisma.locationUsageLog.count({
      where: {
        kind: "external_transfer",
        occurredAt: { gte: startOfToday },
      },
    }),
    prisma.locationUsageLog.count({
      where: {
        retentionUntil: {
          gt: new Date(),
          lte: sevenDaysFromNow,
        },
      },
    }),
  ]);
  const response: AdminOverviewResponse = {
    overview: {
      users,
      admins,
      activePlaces,
      pendingPlaces,
      pendingReports,
      pendingInquiries,
      logsToday,
      locationCompliance: {
        activeConsents: Number(activeConsentRows[0]?.count ?? 0),
        usageLogsToday: locationUsageLogsToday,
        externalTransfersToday,
        expiringWithinSevenDays,
        externalProcessingMode: getExternalLocationProcessingMode(),
      },
    },
  };

  return withCors(request, Response.json(response));
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}
