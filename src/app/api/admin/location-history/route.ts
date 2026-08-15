import { authenticateAdmin } from "@/server/admin/auth";
import { writeSystemLogSafely } from "@/server/admin/log";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import {
  createRequestAuditIdentity,
  recordLocationSecurityAuditEvent,
  recordLocationSecurityAuditEventSafely,
  verifyLocationSecurityAuditEvent,
} from "@/server/location/securityAudit";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import type { AdminLocationHistoryResponse } from "@/shared/api/admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json({ error: "허용되지 않은 요청 출처예요." }, { status: 403 });
  }
  const authentication = await authenticateAdmin(request);
  if (!authentication.ok) {
    await recordLocationSecurityAuditEventSafely({
      category: "system_access",
      result: "denied",
      actorIdentity: createRequestAuditIdentity(request),
      action: "admin.location-history.read",
      resource: "location_usage_logs",
      details: { responseStatus: authentication.response.status },
    });
    return withCors(request, authentication.response);
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim().slice(0, 120);
  const kind = normalizeKind(url.searchParams.get("kind"));
  const service = normalizeService(url.searchParams.get("service"));
  const days = normalizeDays(url.searchParams.get("days"));
  const occurredAfter = days
    ? new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    : undefined;
  const where: Prisma.LocationUsageLogWhereInput = {
    ...(kind ? { kind } : {}),
    ...(service ? { service } : {}),
    ...(occurredAfter ? { occurredAt: { gte: occurredAfter } } : {}),
    ...(query
      ? {
          OR: [
            { userId: { contains: query, mode: "insensitive" } },
            { externalRecipient: { contains: query, mode: "insensitive" } },
            { method: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [logs, total, securityEvents, securityEventTotal] = await Promise.all([
    prisma.locationUsageLog.findMany({
      where,
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: 200,
      select: {
        id: true,
        userId: true,
        acquisitionSource: true,
        service: true,
        kind: true,
        method: true,
        externalRecipient: true,
        externalPurpose: true,
        externalMode: true,
        occurredAt: true,
        retentionUntil: true,
      },
    }),
    prisma.locationUsageLog.count({ where }),
    prisma.locationSecurityAuditEvent.findMany({
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: 200,
    }),
    prisma.locationSecurityAuditEvent.count(),
  ]);
  const response: AdminLocationHistoryResponse = {
    total,
    logs: logs.map((log) => ({
      ...log,
      occurredAt: log.occurredAt.toISOString(),
      retentionUntil: log.retentionUntil.toISOString(),
    })),
    securityEvents: securityEvents.map((event) => ({
      id: event.id,
      category: event.category,
      result: event.result,
      actorUserId: event.actorUserId,
      action: event.action,
      resource: event.resource,
      details: event.details,
      occurredAt: event.occurredAt.toISOString(),
      retentionUntil: event.retentionUntil.toISOString(),
      integrityValid: verifyLocationSecurityAuditEvent(event),
    })),
    securityEventTotal,
  };
  await recordLocationSecurityAuditEvent({
    category: "system_access",
    result: "success",
    actorUserId: authentication.user.id,
    actorIdentity: `user:${authentication.user.id}`,
    ...(query ? { targetIdentity: `query:${query}` } : {}),
    action: "admin.location-history.read",
    resource: "location_usage_logs",
    details: {
      resultCount: logs.length,
      total,
      securityEventCount: securityEvents.length,
      kind: kind ?? "all",
      service: service ?? "all",
      days: days ?? 0,
      queryUsed: Boolean(query),
    },
  });
  await writeSystemLogSafely({
    category: "location-compliance",
    action: "view-location-history",
    message: "관리자가 위치정보 이용·제공사실 확인자료를 조회했습니다.",
    actorUserId: authentication.user.id,
    metadata: {
      resultCount: logs.length,
      total,
      kind: kind ?? "all",
      service: service ?? "all",
      days: days ?? 0,
      queryUsed: Boolean(query),
    },
  });
  return withCors(request, Response.json(response));
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}

function normalizeKind(value: string | null) {
  return value === "internal_use" || value === "external_transfer"
    ? value
    : undefined;
}

function normalizeService(value: string | null) {
  return value === "recommendation" ||
    value === "travel_time" ||
    value === "departure_plan" ||
    value === "photo_nearby"
    ? value
    : undefined;
}

function normalizeDays(value: string | null) {
  const days = Number(value);
  return days === 7 || days === 30 || days === 90 ? days : undefined;
}
