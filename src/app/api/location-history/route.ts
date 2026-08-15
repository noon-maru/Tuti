import { authenticateUser } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import type { LocationHistoryResponse } from "@/shared/api/locationHistory";

export const runtime = "nodejs";

const MAXIMUM_HISTORY_ITEMS = 100;

export async function GET(request: Request) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json({ error: "허용되지 않은 요청 출처예요." }, { status: 403 });
  }

  const user = await authenticateUser(request);
  if (!user) {
    return withCors(
      request,
      Response.json(
        { error: "사용자 세션을 확인해주세요." },
        { status: 401 },
      ),
    );
  }

  const [consentEvents, usageLogs, usageLogTotal] = await Promise.all([
    prisma.locationConsentEvent.findMany({
      where: { userId: user.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 30,
      select: {
        id: true,
        status: true,
        termsVersion: true,
        ageConfirmed: true,
        clientPlatform: true,
        createdAt: true,
      },
    }),
    prisma.locationUsageLog.findMany({
      where: { userId: user.id },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: MAXIMUM_HISTORY_ITEMS,
      select: {
        id: true,
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
    prisma.locationUsageLog.count({ where: { userId: user.id } }),
  ]);

  const response: LocationHistoryResponse = {
    consentEvents: consentEvents.map((event) => ({
      ...event,
      createdAt: event.createdAt.toISOString(),
    })),
    usageLogs: usageLogs.map((log) => ({
      ...log,
      occurredAt: log.occurredAt.toISOString(),
      retentionUntil: log.retentionUntil.toISOString(),
    })),
    usageLogTotal,
    notice:
      "확인자료에는 실제 위도·경도가 포함되지 않으며 보존기간이 끝나면 자동으로 파기됩니다.",
  };

  return withCors(request, Response.json(response));
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}
