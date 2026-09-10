import { randomUUID } from "node:crypto";
import { authenticateAdmin } from "@/server/admin/auth";
import { writeSystemLog } from "@/server/admin/log";
import { prisma } from "@/server/db/prisma";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import {
  invalidateTrafficBlockCache,
  isTrafficSecurityActive,
  TRAFFIC_SECURITY_ACTIVATES_AT,
  type TrafficBlockScope,
} from "@/server/security/trafficSecurity";
import type {
  AdminSecurityTrafficResponse,
  AdminTrafficActor,
  AdminTrafficBlockRule,
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
  const [
    observations,
    activityUsers,
    trackingBoundary,
    stableTrackingBoundary,
    blockRules,
  ] = await Promise.all([
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
    prisma.trafficObservation.aggregate({
      where: { actorKey: { not: null } },
      _min: { firstSeenAt: true },
    }),
    prisma.trafficBlockRule.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  const daily = createDailyRows(periodDays);
  const findings = new Map<string, FindingAccumulator>();
  const routes = new Map<string, RouteAccumulator>();
  const actors = new Map<string, ActorAccumulator>();
  const visitorDays = new Set<string>();

  let requests = 0;
  let likelyHumanRequests = 0;
  let botRequests = 0;
  let unknownRequests = 0;
  let riskyRequests = 0;
  let rateLimitedRequests = 0;
  let blockedRequests = 0;

  const now = new Date();
  const activeActorBlocks = new Set(
    blockRules
      .filter((rule) => isRuleActive(rule, now) && rule.scope === "actor")
      .map((rule) => rule.subjectKey),
  );
  const activeAddressBlocks = new Set(
    blockRules
      .filter((rule) => isRuleActive(rule, now) && rule.scope === "address")
      .map((rule) => rule.subjectKey),
  );

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
    blockedRequests += observation.blockedCount;
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

    if (observation.actorKey) {
      const actor = actors.get(observation.actorKey) ?? {
        actorKey: observation.actorKey,
        addressKey: observation.addressKey,
        addressPreview: observation.addressPreview ?? "주소 확인 불가",
        agentSummary: observation.agentSummary ?? "클라이언트 정보 없음",
        riskLevel: "low" as AdminTrafficActor["riskLevel"],
        requestCount: 0,
        rateLimitedCount: 0,
        blockedCount: 0,
        signals: new Set<string>(),
        pathGroups: new Set<string>(),
        firstSeenAt: observation.firstSeenAt,
        lastSeenAt: observation.lastSeenAt,
      };
      actor.requestCount += count;
      actor.rateLimitedCount += observation.rateLimitedCount;
      actor.blockedCount += observation.blockedCount;
      actor.signals.add(observation.signal);
      actor.pathGroups.add(observation.pathGroup);
      if (riskScore(normalizeRisk(observation.riskLevel)) > riskScore(actor.riskLevel)) {
        actor.riskLevel = normalizeRisk(observation.riskLevel);
      }
      if (actor.firstSeenAt > observation.firstSeenAt) actor.firstSeenAt = observation.firstSeenAt;
      if (actor.lastSeenAt < observation.lastSeenAt) actor.lastSeenAt = observation.lastSeenAt;
      actors.set(observation.actorKey, actor);
    }

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
    controls: {
      active: isTrafficSecurityActive(now),
      activatesAt: TRAFFIC_SECURITY_ACTIVATES_AT,
      stableTrackingStartedAt:
        stableTrackingBoundary._min.firstSeenAt?.toISOString() ?? null,
    },
    summary: {
      requests,
      dailyVisitors: visitorDays.size,
      likelyHumanRequests,
      botRequests,
      unknownRequests,
      riskyRequests,
      rateLimitedRequests,
      blockedRequests,
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
    actors: [...actors.values()]
      .filter((actor) =>
        actor.signals.has("scanner_path") ||
        actor.signals.has("injection_probe") ||
        actor.signals.has("prohibited_method") ||
        actor.signals.has("rate_limited") ||
        actor.signals.has("missing_user_agent") ||
        actor.signals.has("automation_agent"),
      )
      .sort((left, right) =>
        riskScore(right.riskLevel) - riskScore(left.riskLevel) ||
        right.requestCount - left.requestCount,
      )
      .slice(0, 100)
      .map((actor) => serializeActor(actor, activeActorBlocks, activeAddressBlocks)),
    blockRules: blockRules.map((rule) => serializeBlockRule(rule, now)),
  };

  return withCors(request, Response.json(response));
}

export async function POST(request: Request) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json({ error: "허용되지 않은 요청 출처예요." }, { status: 403 });
  }
  const authentication = await authenticateAdmin(request);
  if (!authentication.ok) return withCors(request, authentication.response);

  try {
    const body = (await request.json()) as {
      actorKey?: unknown;
      scope?: unknown;
      reason?: unknown;
      durationHours?: unknown;
    };
    const actorKey = typeof body.actorKey === "string" ? body.actorKey.trim() : "";
    const scope = normalizeBlockScope(body.scope);
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const durationHours = normalizeDurationHours(body.durationHours);

    if (!actorKey || !scope || reason.length < 4 || reason.length > 240 || durationHours === undefined) {
      return withCors(
        request,
        Response.json({ error: "차단 범위, 기간과 사유를 확인해주세요." }, { status: 400 }),
      );
    }

    const observation = await prisma.trafficObservation.findFirst({
      where: { actorKey },
      orderBy: { lastSeenAt: "desc" },
      select: {
        actorKey: true,
        addressKey: true,
        addressPreview: true,
        agentSummary: true,
      },
    });
    const subjectKey = scope === "actor" ? observation?.actorKey : observation?.addressKey;
    if (!observation || !subjectKey) {
      return withCors(
        request,
        Response.json({ error: "차단할 요청 주체를 찾지 못했습니다." }, { status: 404 }),
      );
    }

    const now = new Date();
    const existing = await prisma.trafficBlockRule.findFirst({
      where: {
        scope,
        subjectKey,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    });
    if (existing) {
      return withCors(
        request,
        Response.json({ error: "이미 같은 범위의 차단이 적용되어 있습니다." }, { status: 409 }),
      );
    }

    const expiresAt = durationHours === null
      ? null
      : new Date(now.getTime() + durationHours * 60 * 60 * 1_000);
    const rule = await prisma.trafficBlockRule.create({
      data: {
        id: randomUUID(),
        scope,
        subjectKey,
        subjectPreview:
          scope === "actor"
            ? `${observation.addressPreview ?? "주소 확인 불가"} · ${observation.agentSummary ?? "클라이언트 정보 없음"}`
            : observation.addressPreview ?? "주소 확인 불가",
        agentSummary: observation.agentSummary,
        reason,
        source: "manual",
        createdByUserId: authentication.user.id,
        expiresAt,
      },
    });

    invalidateTrafficBlockCache();
    await writeSystemLog({
      level: "warning",
      category: "security",
      action: "traffic.block.created",
      message: "트래픽 요청 주체 차단 규칙을 만들었습니다.",
      actorUserId: authentication.user.id,
      targetType: "traffic_block_rule",
      targetId: rule.id,
      metadata: { scope, durationHours, subjectPreview: rule.subjectPreview },
    });

    return withCors(request, Response.json({ rule: serializeBlockRule(rule, now) }));
  } catch (error) {
    const invalidJson = error instanceof SyntaxError;
    if (!invalidJson) console.error("트래픽 차단 규칙을 만들지 못했습니다.", error);
    return withCors(
      request,
      Response.json(
        { error: invalidJson ? "요청 본문을 확인해주세요." : "차단 규칙을 만들지 못했습니다." },
        { status: invalidJson ? 400 : 500 },
      ),
    );
  }
}

export async function DELETE(request: Request) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json({ error: "허용되지 않은 요청 출처예요." }, { status: 403 });
  }
  const authentication = await authenticateAdmin(request);
  if (!authentication.ok) return withCors(request, authentication.response);

  try {
    const body = (await request.json()) as { ruleId?: unknown };
    const ruleId = typeof body.ruleId === "string" ? body.ruleId.trim() : "";
    if (!ruleId) {
      return withCors(
        request,
        Response.json({ error: "해제할 차단 규칙을 확인해주세요." }, { status: 400 }),
      );
    }

    const current = await prisma.trafficBlockRule.findUnique({ where: { id: ruleId } });
    if (!current || current.revokedAt) {
      return withCors(
        request,
        Response.json({ error: "활성 차단 규칙을 찾지 못했습니다." }, { status: 404 }),
      );
    }
    const revokedAt = new Date();
    const rule = await prisma.trafficBlockRule.update({
      where: { id: ruleId },
      data: { revokedAt, revokedByUserId: authentication.user.id },
    });

    invalidateTrafficBlockCache();
    await writeSystemLog({
      level: "info",
      category: "security",
      action: "traffic.block.revoked",
      message: "트래픽 요청 주체 차단을 해제했습니다.",
      actorUserId: authentication.user.id,
      targetType: "traffic_block_rule",
      targetId: rule.id,
      metadata: { scope: rule.scope, subjectPreview: rule.subjectPreview },
    });

    return withCors(request, Response.json({ rule: serializeBlockRule(rule, revokedAt) }));
  } catch (error) {
    const invalidJson = error instanceof SyntaxError;
    if (!invalidJson) console.error("트래픽 차단을 해제하지 못했습니다.", error);
    return withCors(
      request,
      Response.json(
        { error: invalidJson ? "요청 본문을 확인해주세요." : "차단을 해제하지 못했습니다." },
        { status: invalidJson ? 400 : 500 },
      ),
    );
  }
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

type ActorAccumulator = {
  actorKey: string;
  addressKey: string | null;
  addressPreview: string;
  agentSummary: string;
  riskLevel: AdminTrafficActor["riskLevel"];
  requestCount: number;
  rateLimitedCount: number;
  blockedCount: number;
  signals: Set<string>;
  pathGroups: Set<string>;
  firstSeenAt: Date;
  lastSeenAt: Date;
};

type BlockRuleRecord = {
  id: string;
  scope: string;
  subjectKey: string;
  subjectPreview: string;
  agentSummary: string | null;
  reason: string;
  source: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
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

function serializeActor(
  value: ActorAccumulator,
  activeActorBlocks: Set<string>,
  activeAddressBlocks: Set<string>,
): AdminTrafficActor {
  return {
    actorKey: value.actorKey,
    addressKey: value.addressKey,
    shortId: value.actorKey.slice(0, 8).toUpperCase(),
    addressPreview: value.addressPreview,
    agentSummary: value.agentSummary,
    riskLevel: value.riskLevel,
    requestCount: value.requestCount,
    rateLimitedCount: value.rateLimitedCount,
    blockedCount: value.blockedCount,
    signals: [...value.signals].sort((left, right) =>
      signalScore(right) - signalScore(left),
    ),
    pathGroups: [...value.pathGroups].slice(0, 12),
    firstSeenAt: value.firstSeenAt.toISOString(),
    lastSeenAt: value.lastSeenAt.toISOString(),
    actorBlocked: activeActorBlocks.has(value.actorKey),
    addressBlocked:
      Boolean(value.addressKey) && activeAddressBlocks.has(value.addressKey!),
  };
}

function serializeBlockRule(
  value: BlockRuleRecord,
  now: Date,
): AdminTrafficBlockRule {
  return {
    id: value.id,
    scope: value.scope === "address" ? "address" : "actor",
    subjectPreview: value.subjectPreview,
    agentSummary: value.agentSummary,
    reason: value.reason,
    source: value.source === "automatic" ? "automatic" : "manual",
    active: isRuleActive(value, now),
    expiresAt: value.expiresAt?.toISOString() ?? null,
    revokedAt: value.revokedAt?.toISOString() ?? null,
    createdAt: value.createdAt.toISOString(),
  };
}

function isRuleActive(
  value: Pick<BlockRuleRecord, "revokedAt" | "expiresAt">,
  now: Date,
) {
  return !value.revokedAt && (!value.expiresAt || value.expiresAt > now);
}

function normalizeBlockScope(value: unknown): TrafficBlockScope | null {
  return value === "actor" || value === "address" ? value : null;
}

function normalizeDurationHours(value: unknown): number | null | undefined {
  if (value === null) return null;
  return value === 1 || value === 24 || value === 168 ? value : undefined;
}

function signalScore(value: string) {
  if (value === "injection_probe" || value === "scanner_path") return 4;
  if (value === "prohibited_method") return 3;
  if (value === "rate_limited" || value === "missing_user_agent") return 2;
  return 1;
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
