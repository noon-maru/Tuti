import { authenticateAdmin } from "@/server/admin/auth";
import { writeSystemLog } from "@/server/admin/log";
import {
  isMeaningfulActivityStage,
  resolveUserActivityStage,
} from "@/server/admin/userActivity";
import { prisma } from "@/server/db/prisma";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import type {
  AdminUserActivityDay,
  AdminUserActivityItem,
  AdminUserActivityResponse,
} from "@/shared/api/admin";

export const runtime = "nodejs";

const DAY_MS = 24 * 60 * 60 * 1_000;

export async function GET(request: Request) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json({ error: "허용되지 않은 요청 출처예요." }, { status: 403 });
  }

  const authentication = await authenticateAdmin(request);
  if (!authentication.ok) return withCors(request, authentication.response);

  const periodDays = normalizePeriodDays(
    new URL(request.url).searchParams.get("days"),
  );
  const since = new Date(Date.now() - periodDays * DAY_MS);

  const [
    users,
    productEvents,
    recommendationRuns,
    recommendationActions,
    journals,
    trackingBoundary,
  ] = await Promise.all([
      prisma.user.findMany({
        where: {
          OR: [
            { createdAt: { gte: since } },
            { productActivityEvents: { some: { createdAt: { gte: since } } } },
            { recommendationRuns: { some: { createdAt: { gte: since } } } },
            { recommendationActions: { some: { createdAt: { gte: since } } } },
            { journalEntries: { some: { createdAt: { gte: since } } } },
          ],
        },
        select: {
          id: true,
          displayName: true,
          role: true,
          createdAt: true,
          lastAccessedAt: true,
          analyticsExcludedAt: true,
          analyticsExclusionReason: true,
          authIdentities: { select: { id: true } },
        },
        orderBy: { lastAccessedAt: "desc" },
        take: 500,
      }),
      prisma.productActivityEvent.findMany({
        where: { createdAt: { gte: since } },
        select: {
          userId: true,
          clientSessionId: true,
          action: true,
          platform: true,
          appVersion: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.recommendationRun.findMany({
        where: { createdAt: { gte: since } },
        select: { userId: true, createdAt: true },
      }),
      prisma.recommendationAction.findMany({
        where: { createdAt: { gte: since } },
        select: { userId: true, action: true, createdAt: true },
      }),
      prisma.journalEntry.findMany({
        where: { createdAt: { gte: since } },
        select: { ownerId: true, createdAt: true },
      }),
      prisma.productActivityEvent.aggregate({
        _min: { createdAt: true },
      }),
    ]);

  const productByUser = groupBy(productEvents, (event) => event.userId);
  const runsByUser = groupBy(recommendationRuns, (run) => run.userId);
  const actionsByUser = groupBy(recommendationActions, (action) => action.userId);
  const journalsByUser = groupBy(journals, (journal) => journal.ownerId);
  const daily = new Map<string, {
    newUsers: Set<string>;
    activeUsers: Set<string>;
    meaningfulUsers: Set<string>;
  }>();
  const trackingStartedAt = trackingBoundary._min.createdAt?.toISOString() ?? null;

  const items = users.map<AdminUserActivityItem>((user) => {
    const events = productByUser.get(user.id) ?? [];
    const runs = runsByUser.get(user.id) ?? [];
    const actions = actionsByUser.get(user.id) ?? [];
    const userJournals = journalsByUser.get(user.id) ?? [];
    const stage = resolveUserActivityStage({
      productActions: events.map((event) => event.action),
      recommendationRuns: runs.length,
      recommendationActions: actions.map((action) => action.action),
      journalCount: userJournals.length,
    });
    const timestamps = [
      ...(user.createdAt >= since ? [user.createdAt] : []),
      ...(user.lastAccessedAt >= since ? [user.lastAccessedAt] : []),
      ...events.map((event) => event.createdAt),
      ...runs.map((run) => run.createdAt),
      ...actions.map((action) => action.createdAt),
      ...userJournals.map((journal) => journal.createdAt),
    ].sort((left, right) => left.getTime() - right.getTime());
    const latestEvent = events.at(-1);
    const excluded = user.role === "admin" || Boolean(user.analyticsExcludedAt);
    const item: AdminUserActivityItem = {
      userId: user.id,
      displayName: user.displayName,
      accountType:
        user.role === "admin"
          ? "admin"
          : user.authIdentities.length > 0
            ? "authenticated"
            : "anonymous",
      stage,
      excluded,
      exclusionReason:
        user.role === "admin"
          ? "관리자 계정"
          : user.analyticsExclusionReason,
      platform: latestEvent?.platform ?? null,
      appVersion: latestEvent?.appVersion ?? null,
      sessionCount: new Set(events.map((event) => event.clientSessionId)).size,
      recommendationRuns: runs.length,
      recommendationActions: actions.length,
      journalCount: userJournals.length,
      createdAt: user.createdAt.toISOString(),
      firstActivityAt: (timestamps[0] ?? user.createdAt).toISOString(),
      lastActivityAt: (timestamps.at(-1) ?? user.lastAccessedAt).toISOString(),
    };

    if (!excluded) {
      addDailyUser(daily, user.createdAt, since, user.id, "newUsers");
      for (const timestamp of timestamps) {
        addDailyUser(daily, timestamp, since, user.id, "activeUsers");
      }
      for (const signal of [...runs, ...actions, ...userJournals]) {
        addDailyUser(daily, signal.createdAt, since, user.id, "meaningfulUsers");
      }
    }
    return item;
  });

  const included = items.filter((item) => !item.excluded);
  const response: AdminUserActivityResponse = {
    periodDays,
    generatedAt: new Date().toISOString(),
    trackingStartedAt,
    summary: {
      observedUsers: included.length,
      newUsers: included.filter((item) => new Date(item.createdAt) >= since).length,
      returningUsers: included.filter((item) => item.sessionCount >= 2).length,
      meaningfulUsers: included.filter((item) => isMeaningfulActivityStage(item.stage)).length,
      convertedUsers: included.filter((item) => item.stage === "converted").length,
      authenticatedUsers: included.filter((item) => item.accountType === "authenticated").length,
      excludedUsers: items.filter((item) => item.excluded).length,
    },
    daily: serializeDaily(daily, periodDays),
    users: items,
  };

  return withCors(request, Response.json(response));
}

export async function PATCH(request: Request) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json({ error: "허용되지 않은 요청 출처예요." }, { status: 403 });
  }
  const authentication = await authenticateAdmin(request);
  if (!authentication.ok) return withCors(request, authentication.response);

  try {
    const body = (await request.json()) as { userId?: unknown; excluded?: unknown };
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    if (!userId || typeof body.excluded !== "boolean") {
      return withCors(
        request,
        Response.json({ error: "분석 제외 설정을 확인해주세요." }, { status: 400 }),
      );
    }
    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!target) {
      return withCors(request, Response.json({ error: "사용자를 찾지 못했습니다." }, { status: 404 }));
    }
    if (target.role === "admin" && body.excluded === false) {
      return withCors(
        request,
        Response.json({ error: "관리자 계정은 분석에 포함할 수 없습니다." }, { status: 409 }),
      );
    }

    await prisma.user.update({
      where: { id: userId },
      data: body.excluded
        ? {
            analyticsExcludedAt: new Date(),
            analyticsExclusionReason: "내부·QA 계정",
            analyticsExcludedByUserId: authentication.user.id,
          }
        : {
            analyticsExcludedAt: null,
            analyticsExclusionReason: null,
            analyticsExcludedByUserId: null,
          },
    });
    await writeSystemLog({
      category: "analytics",
      action: body.excluded ? "user.excluded" : "user.included",
      message: body.excluded
        ? "사용자를 실사용 분석에서 제외했습니다."
        : "사용자를 실사용 분석에 다시 포함했습니다.",
      actorUserId: authentication.user.id,
      targetType: "user",
      targetId: userId,
    });
    return withCors(request, Response.json({ updated: true }));
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      console.error("사용자 분석 분류를 변경하지 못했습니다.", error);
    }
    return withCors(
      request,
      Response.json({ error: "사용자 분석 분류를 변경하지 못했습니다." }, { status: 500 }),
    );
  }
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}

function normalizePeriodDays(value: string | null) {
  const parsed = Number(value);
  return parsed === 30 || parsed === 90 ? parsed : 7;
}

function groupBy<T>(items: T[], key: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const value = key(item);
    const group = groups.get(value);
    if (group) group.push(item);
    else groups.set(value, [item]);
  }
  return groups;
}

function addDailyUser(
  daily: Map<string, { newUsers: Set<string>; activeUsers: Set<string>; meaningfulUsers: Set<string> }>,
  timestamp: Date,
  since: Date,
  userId: string,
  field: "newUsers" | "activeUsers" | "meaningfulUsers",
) {
  if (timestamp < since) return;
  const date = koreanDateKey(timestamp);
  const row = daily.get(date) ?? {
    newUsers: new Set<string>(),
    activeUsers: new Set<string>(),
    meaningfulUsers: new Set<string>(),
  };
  row[field].add(userId);
  daily.set(date, row);
}

function serializeDaily(
  daily: Map<string, { newUsers: Set<string>; activeUsers: Set<string>; meaningfulUsers: Set<string> }>,
  periodDays: number,
) {
  const rows: AdminUserActivityDay[] = [];
  for (let offset = periodDays - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.now() - offset * DAY_MS);
    const key = koreanDateKey(date);
    const value = daily.get(key);
    rows.push({
      date: key,
      newUsers: value?.newUsers.size ?? 0,
      activeUsers: value?.activeUsers.size ?? 0,
      meaningfulUsers: value?.meaningfulUsers.size ?? 0,
    });
  }
  return rows;
}

function koreanDateKey(value: Date) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}
