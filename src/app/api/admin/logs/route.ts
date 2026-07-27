import { authenticateAdmin } from "@/server/admin/auth";
import { prisma } from "@/server/db/prisma";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import type { AdminLogsResponse } from "@/shared/api/admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json({ error: "허용되지 않은 요청 출처예요." }, { status: 403 });
  }

  const authentication = await authenticateAdmin(request);

  if (!authentication.ok) {
    return withCors(request, authentication.response);
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim().slice(0, 120);
  const level = normalizeLevel(url.searchParams.get("level"));
  const logs = await prisma.systemLog.findMany({
    where: {
      ...(level ? { level } : {}),
      ...(query
        ? {
            OR: [
              { message: { contains: query, mode: "insensitive" } },
              { category: { contains: query, mode: "insensitive" } },
              { action: { contains: query, mode: "insensitive" } },
              { actorUserId: { contains: query, mode: "insensitive" } },
              { targetId: { contains: query, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const response: AdminLogsResponse = {
    logs: logs.map((log) => ({
      ...log,
      createdAt: log.createdAt.toISOString(),
    })),
  };

  return withCors(request, Response.json(response));
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}

function normalizeLevel(value: string | null) {
  return value === "info" || value === "warning" || value === "error"
    ? value
    : undefined;
}
