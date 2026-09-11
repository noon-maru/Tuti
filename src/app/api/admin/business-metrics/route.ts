import { authenticateAdmin } from "@/server/admin/auth";
import { calculateBusinessMetrics } from "@/server/admin/businessMetrics";
import { prisma } from "@/server/db/prisma";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";

export const runtime = "nodejs";

const DAY_MS = 24 * 60 * 60 * 1_000;

export async function GET(request: Request) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json(
      { error: "허용되지 않은 요청 출처예요." },
      { status: 403 },
    );
  }
  const authentication = await authenticateAdmin(request);
  if (!authentication.ok) return withCors(request, authentication.response);

  const now = new Date();
  const periodDays = normalizePeriodDays(
    new URL(request.url).searchParams.get("days"),
  );
  const periodSince = new Date(now.getTime() - periodDays * DAY_MS);
  const analysisSince = new Date(now.getTime() - 100 * DAY_MS);
  const includedUserWhere = {
    role: "user" as const,
    analyticsExcludedAt: null,
  };

  const [users, trackingBoundary] = await Promise.all([
    prisma.user.findMany({
      where: {
        ...includedUserWhere,
        OR: [
          { createdAt: { gte: analysisSince } },
          {
            productActivityEvents: {
              some: {
                action: "session_started",
                createdAt: { gte: analysisSince },
              },
            },
          },
        ],
      },
      select: {
        id: true,
        createdAt: true,
        authIdentities: { select: { id: true }, take: 1 },
      },
    }),
    prisma.productActivityEvent.aggregate({
      where: {
        action: "session_started",
        user: includedUserWhere,
      },
      _min: { createdAt: true },
    }),
  ]);
  const userIds = users.map((user) => user.id);

  const [sessions, firstSessionRows, productEvents, runs, actions] =
    await Promise.all([
      prisma.productActivityEvent.findMany({
        where: {
          userId: { in: userIds },
          action: "session_started",
          createdAt: { gte: analysisSince },
        },
        select: {
          userId: true,
          platform: true,
          createdAt: true,
        },
      }),
      prisma.productActivityEvent.groupBy({
        by: ["userId"],
        where: {
          userId: { in: userIds },
          action: "session_started",
        },
        _min: { createdAt: true },
      }),
      prisma.productActivityEvent.findMany({
        where: {
          userId: { in: userIds },
          action: "entry_completed",
          createdAt: { gte: periodSince },
        },
        select: { userId: true, action: true, createdAt: true },
      }),
      prisma.recommendationRun.findMany({
        where: {
          userId: { in: userIds },
          createdAt: { gte: periodSince },
        },
        select: { userId: true, createdAt: true },
      }),
      prisma.recommendationAction.findMany({
        where: {
          userId: { in: userIds },
          createdAt: { gte: periodSince },
          action: {
            in: [
              "place_selected",
              "departure_peek_opened",
              "departure_plan_expanded",
              "navigation_started",
              "return_confirmed",
              "journal_created",
            ],
          },
        },
        select: { userId: true, action: true, createdAt: true },
      }),
    ]);

  const response = calculateBusinessMetrics({
    now,
    periodDays,
    trackingStartedAt: trackingBoundary._min.createdAt,
    users: users.map((user) => ({
      id: user.id,
      createdAt: user.createdAt,
      authenticated: user.authIdentities.length > 0,
    })),
    sessions,
    firstSessions: firstSessionRows.flatMap((row) =>
      row._min.createdAt
        ? [{ userId: row.userId, createdAt: row._min.createdAt }]
        : [],
    ),
    productEvents,
    recommendationRuns: runs,
    recommendationActions: actions,
  });
  return withCors(request, Response.json(response));
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}

function normalizePeriodDays(value: string | null): 30 | 90 {
  return Number(value) === 90 ? 90 : 30;
}
