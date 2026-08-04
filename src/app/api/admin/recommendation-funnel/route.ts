import { authenticateAdmin } from "@/server/admin/auth";
import { prisma } from "@/server/db/prisma";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import type {
  AdminRecommendationFunnelResponse,
  AdminRecommendationFunnelStage,
} from "@/shared/api/admin";

export const runtime = "nodejs";

const STAGES = [
  ["recommendation_shown", "추천 노출"],
  ["place_selected", "장소 선택"],
  ["departure_peek_opened", "출발 준비 확인"],
  ["departure_plan_expanded", "출발 정보 펼침"],
  ["navigation_started", "길찾기 시작"],
  ["return_confirmed", "다녀옴 확인"],
  ["journal_created", "기록 남김"],
] as const;

export async function GET(request: Request) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json(
      { error: "허용되지 않은 요청 출처예요." },
      { status: 403 },
    );
  }

  const authentication = await authenticateAdmin(request);
  if (!authentication.ok) {
    return withCors(request, authentication.response);
  }

  const periodDays = normalizePeriodDays(
    new URL(request.url).searchParams.get("days"),
  );
  const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);
  const [runs, actions, algorithmGroups] = await Promise.all([
    prisma.recommendationRun.findMany({
      where: { createdAt: { gte: since } },
      select: { id: true, locationUsed: true },
    }),
    prisma.recommendationAction.findMany({
      where: { createdAt: { gte: since } },
      select: {
        journeyId: true,
        action: true,
        placeId: true,
        place: { select: { name: true } },
      },
    }),
    prisma.recommendationRun.groupBy({
      by: ["algorithmVersion"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { algorithmVersion: "desc" } },
    }),
  ]);

  const runCount = runs.length;
  const actionJourneys = new Map<string, Set<string>>();
  for (const action of actions) {
    const journeys = actionJourneys.get(action.action) ?? new Set<string>();
    journeys.add(action.journeyId);
    actionJourneys.set(action.action, journeys);
  }

  let previousCount = runCount;
  const stages: AdminRecommendationFunnelStage[] = STAGES.map(
    ([action, label], index) => {
      const journeys =
        index === 0 ? runCount : actionJourneys.get(action)?.size ?? 0;
      const stage = {
        action,
        label,
        journeys,
        rateFromRuns: percentage(journeys, runCount),
        rateFromPrevious: percentage(journeys, previousCount),
      };
      previousCount = journeys;
      return stage;
    },
  );

  const places = new Map<
    string,
    {
      placeId: string;
      placeName: string;
      navigation: Set<string>;
      journals: Set<string>;
    }
  >();

  for (const action of actions) {
    if (
      !action.placeId ||
      (action.action !== "navigation_started" &&
        action.action !== "journal_created")
    ) {
      continue;
    }

    const place = places.get(action.placeId) ?? {
      placeId: action.placeId,
      placeName: action.place?.name ?? "삭제된 장소",
      navigation: new Set<string>(),
      journals: new Set<string>(),
    };
    if (action.action === "navigation_started") {
      place.navigation.add(action.journeyId);
    } else {
      place.journals.add(action.journeyId);
    }
    places.set(action.placeId, place);
  }

  const response: AdminRecommendationFunnelResponse = {
    periodDays,
    generatedAt: new Date().toISOString(),
    recommendationRuns: runCount,
    locationUsageRate: percentage(
      runs.filter((run) => run.locationUsed).length,
      runCount,
    ),
    stages,
    topPlaces: [...places.values()]
      .map((place) => ({
        placeId: place.placeId,
        placeName: place.placeName,
        navigationStarted: place.navigation.size,
        journalCreated: place.journals.size,
      }))
      .sort(
        (left, right) =>
          right.navigationStarted - left.navigationStarted ||
          right.journalCreated - left.journalCreated,
      )
      .slice(0, 10),
    algorithms: algorithmGroups.map((group) => ({
      version: group.algorithmVersion,
      runs: group._count._all,
    })),
  };

  return withCors(request, Response.json(response));
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}

function normalizePeriodDays(value: string | null) {
  const parsed = Number(value);
  return parsed === 7 || parsed === 90 ? parsed : 30;
}

function percentage(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 1000) / 10 : 0;
}
