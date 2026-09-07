import { authenticateAdmin } from "@/server/admin/auth";
import { prisma } from "@/server/db/prisma";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import type {
  AdminSecurityTrafficResponse,
  AdminTrafficDay,
  AdminTrafficFinding,
  AdminTrafficKind,
  AdminTrafficRoute,
} from "@/shared/api/admin";

export const runtime = "nodejs";

const DAY_MS = 24 * 60 * 60 * 1_000;

export async function GET(request: Request) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json({ error: "허용되지 않은 요청 출처예요." }, { status: 403 });
  }
  const authentication = await authenticateAdmin(request);
  if (!authentication.ok) return withCors(request, authentication.response);

  const periodDays = normalizePeriodDays(new URL(request.url).searchParams.get("days"));
  const since = new Date(Date.now() - periodDays * DAY_MS);
  const [observations, activityUsers, trackingBoundary] = await Promise.all([
    prisma.trafficObservation.findMany({
      where: { bucketStartedAt: { gte: since } },
      orderBy: { lastSeenAt: "desc" },
      take: 20_000,
    }),
    prisma.productActivityEvent.findMany({
      where: {
        createdAt: { gte: since },
        user: { role: "user", analyticsExcludedAt: null },
      },
      select: { userId: true },
      distinct: ["userId"],
    }),
    prisma.trafficObservation.aggregate({ _min: { firstSeenAt: true } }),
  ]);

  const daily = createDailyRows(periodDays);
  const findings = new Map<string, FindingAccumulator>();
  const routes = new Map<string, RouteAccumulator>();
  const visitorDays = new Set<string>();

  let requests = 0;
  let likelyHumanRequests = 0;
  let botRequests = 0;
  let unknownRequests = 0;
  let riskyRequests = 0;
  let rateLimitedRequests = 0;

  for (const observation of observations) {
    const kind = normalizeKind(observation.kind);
    const date = koreanDateKey(observation.bucketStartedAt);
    const day = daily.get(date);
    const count = observation.requestCount;
    const risky = observation.riskLevel !== "normal";
    const visitorDay = `${date}:${observation.visitorKey}`;

    requests += count;
    if (kind === "likely_human") likelyHumanRequests += count;
    else if (kind === "declared_bot" || kind === "automation") botRequests += count;
    else unknownRequests += count;
    if (risky) riskyRequests += count;
    rateLimitedRequests += observation.rateLimitedCount;
    visitorDays.add(visitorDay);

    if (day) {
      day.requests += count;
      day[kind] += count;
      if (risky) day.risky += count;
      day.rateLimited += observation.rateLimitedCount;
      day.visitors.add(observation.visitorKey);
    }

    const route = routes.get(observation.pathGroup) ?? createRouteAccumulator();
    if (kind === "likely_human") route.likelyHuman += count;
    else if (kind === "declared_bot") route.declaredBots += count;
    else if (kind === "automation") route.automation += count;
    else route.unknown += count;
    route.total += count;
    routes.set(observation.pathGroup, route);

    if (risky) {
      const key = `${observation.signal}:${observation.pathGroup}:${observation.riskLevel}`;
      const finding = findings.get(key) ?? {
        signal: observation.signal,
        pathGroup: observation.pathGroup,
        riskLevel: normalizeRisk(observation.riskLevel),
        requestCount: 0,
        rateLimitedCount: 0,
        visitors: new Set<string>(),
        lastSeenAt: observation.lastSeenAt,
      };
      finding.requestCount += count;
      finding.rateLimitedCount += observation.rateLimitedCount;
      finding.visitors.add(visitorDay);
      if (finding.lastSeenAt < observation.lastSeenAt) {
        finding.lastSeenAt = observation.lastSeenAt;
      }
      findings.set(key, finding);
    }
  }

  const response: AdminSecurityTrafficResponse = {
    periodDays,
    generatedAt: new Date().toISOString(),
    trackingStartedAt: trackingBoundary._min.firstSeenAt?.toISOString() ?? null,
    summary: {
      requests,
      dailyVisitors: visitorDays.size,
      likelyHumanRequests,
      botRequests,
      unknownRequests,
      riskyRequests,
      rateLimitedRequests,
      activityConfirmedUsers: activityUsers.length,
    },
    daily: [...daily.values()].map(serializeDay),
    findings: [...findings.values()]
      .sort((left, right) =>
        riskScore(right.riskLevel) - riskScore(left.riskLevel) ||
        right.requestCount - left.requestCount,
      )
      .slice(0, 30)
      .map(serializeFinding),
    routes: [...routes.entries()]
      .map<AdminTrafficRoute>(([pathGroup, value]) => ({ pathGroup, ...value }))
      .sort((left, right) => right.total - left.total)
      .slice(0, 20),
  };

  return withCors(request, Response.json(response));
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}

type DailyAccumulator = {
  date: string;
  requests: number;
  likely_human: number;
  declared_bot: number;
  automation: number;
  unknown: number;
  risky: number;
  rateLimited: number;
  visitors: Set<string>;
};

type RouteAccumulator = Omit<AdminTrafficRoute, "pathGroup">;

type FindingAccumulator = Omit<AdminTrafficFinding, "dailyVisitors" | "lastSeenAt"> & {
  visitors: Set<string>;
  lastSeenAt: Date;
};

function createDailyRows(periodDays: number) {
  const rows = new Map<string, DailyAccumulator>();
  for (let offset = periodDays - 1; offset >= 0; offset -= 1) {
    const date = koreanDateKey(new Date(Date.now() - offset * DAY_MS));
    rows.set(date, {
      date,
      requests: 0,
      likely_human: 0,
      declared_bot: 0,
      automation: 0,
      unknown: 0,
      risky: 0,
      rateLimited: 0,
      visitors: new Set(),
    });
  }
  return rows;
}

function serializeDay(day: DailyAccumulator): AdminTrafficDay {
  return {
    date: day.date,
    requests: day.requests,
    likelyHuman: day.likely_human,
    declaredBots: day.declared_bot,
    automation: day.automation,
    unknown: day.unknown,
    risky: day.risky,
    rateLimited: day.rateLimited,
    dailyVisitors: day.visitors.size,
  };
}

function createRouteAccumulator(): RouteAccumulator {
  return {
    likelyHuman: 0,
    declaredBots: 0,
    automation: 0,
    unknown: 0,
    total: 0,
  };
}

function serializeFinding(value: FindingAccumulator): AdminTrafficFinding {
  return {
    signal: value.signal,
    pathGroup: value.pathGroup,
    riskLevel: value.riskLevel,
    requestCount: value.requestCount,
    rateLimitedCount: value.rateLimitedCount,
    dailyVisitors: value.visitors.size,
    lastSeenAt: value.lastSeenAt.toISOString(),
  };
}

function normalizeKind(value: string): AdminTrafficKind {
  return value === "likely_human" ||
    value === "declared_bot" ||
    value === "automation"
    ? value
    : "unknown";
}

function normalizeRisk(value: string): AdminTrafficFinding["riskLevel"] {
  return value === "high" || value === "medium" ? value : "low";
}

function riskScore(value: AdminTrafficFinding["riskLevel"]) {
  return value === "high" ? 3 : value === "medium" ? 2 : 1;
}

function normalizePeriodDays(value: string | null) {
  const parsed = Number(value);
  return parsed === 30 || parsed === 90 ? parsed : 7;
}

function koreanDateKey(value: Date) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}
