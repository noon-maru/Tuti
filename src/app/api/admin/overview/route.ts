import { authenticateAdmin } from "@/server/admin/auth";
import { prisma } from "@/server/db/prisma";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import type { AdminOverviewResponse } from "@/shared/api/admin";

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

  const [
    users,
    admins,
    activePlaces,
    pendingPlaces,
    pendingReports,
    logsToday,
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
    prisma.systemLog.count({ where: { createdAt: { gte: startOfToday } } }),
  ]);
  const response: AdminOverviewResponse = {
    overview: {
      users,
      admins,
      activePlaces,
      pendingPlaces,
      pendingReports,
      logsToday,
    },
  };

  return withCors(request, Response.json(response));
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}
