import { randomUUID } from "node:crypto";
import { authenticateUser } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import {
  RECOMMENDATION_ACTION_TYPES,
  type RecommendationActionInput,
  type RecommendationActionResponse,
  type RecommendationActionType,
} from "@/shared/api/recommendationActions";
import type { DepartureRouteMode } from "@/shared/api/departurePlan";

export const runtime = "nodejs";

const ROUTE_MODES: DepartureRouteMode[] = [
  "publicTransit",
  "driving",
  "bicycle",
  "walking",
];

export async function POST(request: Request) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json(
      { error: "허용되지 않은 요청 출처예요." },
      { status: 403 },
    );
  }

  try {
    const user = await authenticateUser(request);
    if (!user) {
      return withCors(
        request,
        Response.json({ error: "사용자 확인이 필요해요." }, { status: 401 }),
      );
    }

    const input = normalizeInput(await request.json());
    if (!input) {
      return withCors(
        request,
        Response.json(
          { error: "행동 기록 요청을 확인해주세요." },
          { status: 400 },
        ),
      );
    }

    if (input.placeId) {
      const place = await prisma.place.findUnique({
        where: { id: input.placeId },
        select: { id: true },
      });
      if (!place) {
        return withCors(
          request,
          Response.json({ error: "장소를 찾지 못했어요." }, { status: 404 }),
        );
      }
    }

    await prisma.recommendationAction.create({
      data: {
        id: randomUUID(),
        journeyId: input.journeyId,
        userId: user.id,
        placeId: input.placeId,
        action: input.action,
        routeMode: input.routeMode,
        metadata: input.metadata,
      },
    });

    const response: RecommendationActionResponse = { recorded: true };
    return withCors(request, Response.json(response, { status: 201 }));
  } catch (error) {
    const invalidJson = error instanceof SyntaxError;
    if (!invalidJson) {
      console.error("추천 행동을 기록하지 못했습니다.", error);
    }

    return withCors(
      request,
      Response.json(
        {
          error: invalidJson
            ? "요청 본문을 확인해주세요."
            : "행동을 기록하지 못했어요.",
        },
        { status: invalidJson ? 400 : 500 },
      ),
    );
  }
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}

function normalizeInput(input: unknown): RecommendationActionInput | null {
  if (!input || typeof input !== "object") return null;

  const value = input as Partial<RecommendationActionInput>;
  const journeyId = normalizeText(value.journeyId, 80);
  const action = normalizeAction(value.action);
  const placeId = normalizeText(value.placeId, 120);
  const routeMode = normalizeRouteMode(value.routeMode);
  const metadata = normalizeMetadata(value.metadata);

  if (!journeyId || !action || (value.metadata && !metadata)) return null;

  return {
    journeyId,
    action,
    ...(placeId ? { placeId } : {}),
    ...(routeMode ? { routeMode } : {}),
    ...(metadata ? { metadata } : {}),
  };
}

function normalizeAction(value: unknown): RecommendationActionType | null {
  return typeof value === "string" &&
    RECOMMENDATION_ACTION_TYPES.includes(value as RecommendationActionType)
    ? (value as RecommendationActionType)
    : null;
}

function normalizeRouteMode(value: unknown): DepartureRouteMode | undefined {
  return typeof value === "string" &&
    ROUTE_MODES.includes(value as DepartureRouteMode)
    ? (value as DepartureRouteMode)
    : undefined;
}

function normalizeMetadata(value: unknown) {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const entries = Object.entries(value).slice(0, 12);
  const metadata: Record<string, string | number | boolean | null> = {};

  for (const [key, item] of entries) {
    const normalizedKey = normalizeText(key, 40);
    if (!normalizedKey) continue;
    if (
      item !== null &&
      typeof item !== "string" &&
      typeof item !== "number" &&
      typeof item !== "boolean"
    ) {
      return null;
    }
    metadata[normalizedKey] =
      typeof item === "string" ? item.slice(0, 240) : item;
  }

  return metadata;
}

function normalizeText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}
