import { authenticateAdmin } from "@/server/admin/auth";
import { writeSystemLog } from "@/server/admin/log";
import { prisma } from "@/server/db/prisma";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import type { AdminPlacesResponse } from "@/shared/api/admin";

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
  const reviewStatus = normalizeReviewStatus(
    url.searchParams.get("reviewStatus"),
  );
  const source = url.searchParams.get("source")?.trim().slice(0, 80);
  const places = await prisma.place.findMany({
    where: {
      ...(reviewStatus ? { reviewStatus } : {}),
      ...(source ? { source } : {}),
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { id: { contains: query, mode: "insensitive" } },
              { source: { contains: query, mode: "insensitive" } },
              { sourceId: { contains: query, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      source: true,
      sourceId: true,
      sourceContentType: true,
      sourceAddress: true,
      sourceCopyright: true,
      sourceSyncedAt: true,
      reviewStatus: true,
      isActive: true,
      movementLevel: true,
      fatigue: true,
      updatedAt: true,
    },
    orderBy: [{ reviewStatus: "asc" }, { updatedAt: "desc" }],
    take: 300,
  });
  const response: AdminPlacesResponse = {
    places: places.map((place) => ({
      ...place,
      sourceSyncedAt: place.sourceSyncedAt?.toISOString() ?? null,
      updatedAt: place.updatedAt.toISOString(),
    })),
  };

  return withCors(request, Response.json(response));
}

export async function PATCH(request: Request) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json({ error: "허용되지 않은 요청 출처예요." }, { status: 403 });
  }

  const authentication = await authenticateAdmin(request);

  if (!authentication.ok) {
    return withCors(request, authentication.response);
  }

  try {
    const body = (await request.json()) as {
      placeId?: unknown;
      reviewStatus?: unknown;
      isActive?: unknown;
      name?: unknown;
      phrase?: unknown;
      note?: unknown;
      image?: unknown;
      travelTime?: unknown;
      today?: unknown;
      fatigue?: unknown;
      movementLevel?: unknown;
      moodTags?: unknown;
    };
    const placeId =
      typeof body.placeId === "string" ? body.placeId.trim() : "";
    const reviewStatus = normalizeReviewStatus(body.reviewStatus);
    const hasActiveValue = typeof body.isActive === "boolean";
    const editorial = normalizeEditorialUpdate(body);

    if (!placeId || (!reviewStatus && !hasActiveValue && !editorial)) {
      return withCors(
        request,
        Response.json({ error: "장소 변경값을 확인해주세요." }, { status: 400 }),
      );
    }

    const place = await prisma.place.update({
      where: { id: placeId },
      data: {
        ...(reviewStatus ? { reviewStatus } : {}),
        ...(hasActiveValue ? { isActive: body.isActive as boolean } : {}),
        ...(editorial ?? {}),
      },
      select: {
        id: true,
        name: true,
        reviewStatus: true,
        isActive: true,
      },
    });

    await writeSystemLog({
      category: "place",
      action: "place.review.updated",
      message: `${place.name} 장소의 검수 상태를 변경했습니다.`,
      actorUserId: authentication.user.id,
      targetType: "place",
      targetId: place.id,
      metadata: {
        reviewStatus: place.reviewStatus,
        isActive: place.isActive,
        editorialUpdated: Boolean(editorial),
      },
    });

    return withCors(request, Response.json({ place }));
  } catch (error) {
    const invalidJson = error instanceof SyntaxError;
    return withCors(
      request,
      Response.json(
        {
          error: invalidJson
            ? "요청 본문을 확인해주세요."
            : "장소 상태를 변경하지 못했습니다.",
        },
        { status: invalidJson ? 400 : 500 },
      ),
    );
  }
}

export async function POST(request: Request) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json({ error: "허용되지 않은 요청 출처예요." }, { status: 403 });
  }

  const authentication = await authenticateAdmin(request);

  if (!authentication.ok) {
    return withCors(request, authentication.response);
  }

  try {
    const body = (await request.json()) as {
      action?: unknown;
      placeIds?: unknown;
      reviewStatus?: unknown;
    };
    const reviewStatus = normalizeReviewStatus(body.reviewStatus);
    const placeIds = normalizePlaceIds(body.placeIds);

    if (body.action !== "bulkReview" || !reviewStatus || placeIds.length === 0) {
      return withCors(
        request,
        Response.json({ error: "일괄 검수 요청을 확인해주세요." }, { status: 400 }),
      );
    }

    const result = await prisma.place.updateMany({
      where: {
        id: { in: placeIds },
        source: "tourapi",
      },
      data: {
        reviewStatus,
        isActive: reviewStatus === "approved",
      },
    });

    await writeSystemLog({
      category: "place",
      action: "place.review.bulk-updated",
      message: `${result.count}개 공공데이터 장소의 검수 상태를 일괄 변경했습니다.`,
      actorUserId: authentication.user.id,
      targetType: "place",
      metadata: {
        placeIds: placeIds.join(","),
        reviewStatus,
        isActive: reviewStatus === "approved",
      },
    });

    return withCors(
      request,
      Response.json({ count: result.count, reviewStatus }),
    );
  } catch (error) {
    const invalidJson = error instanceof SyntaxError;
    return withCors(
      request,
      Response.json(
        {
          error: invalidJson
            ? "요청 본문을 확인해주세요."
            : "장소를 일괄 검수하지 못했습니다.",
        },
        { status: invalidJson ? 400 : 500 },
      ),
    );
  }
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}

function normalizeReviewStatus(value: unknown) {
  return value === "pending" ||
    value === "approved" ||
    value === "rejected"
    ? value
    : undefined;
}

function normalizeEditorialUpdate(body: {
  name?: unknown;
  phrase?: unknown;
  note?: unknown;
  image?: unknown;
  travelTime?: unknown;
  today?: unknown;
  fatigue?: unknown;
  movementLevel?: unknown;
  moodTags?: unknown;
}) {
  const hasEditorialField = [
    body.name,
    body.phrase,
    body.note,
    body.image,
    body.travelTime,
    body.today,
    body.fatigue,
    body.movementLevel,
    body.moodTags,
  ].some((value) => value !== undefined);

  if (!hasEditorialField) return null;

  const name = normalizeRequiredText(body.name, "장소명", 120);
  const phrase = normalizeRequiredText(body.phrase, "한 줄 설명", 160);
  const note = normalizeRequiredText(body.note, "설명", 1_000);
  const image = normalizeRequiredText(body.image, "이미지 주소", 2_000);
  const travelTime = normalizeRequiredText(body.travelTime, "이동 시간", 80);
  const today = normalizeRequiredText(body.today, "오늘 안내", 160);
  const fatigue = normalizeFatigue(body.fatigue);
  const movementLevel = normalizeMovementLevel(body.movementLevel);
  const moodTags = normalizeMoodTags(body.moodTags);

  return {
    name,
    phrase,
    note,
    image,
    travelTime,
    today,
    fatigue,
    movementLevel,
    moodTags,
  };
}

function normalizeRequiredText(value: unknown, label: string, maxLength: number) {
  if (typeof value !== "string") {
    throw new Error(`${label}을 입력해주세요.`);
  }

  const normalized = value.trim().slice(0, maxLength);
  if (!normalized) throw new Error(`${label}을 입력해주세요.`);
  return normalized;
}

function normalizeFatigue(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 5) {
    throw new Error("피로도는 1부터 5 사이의 정수여야 합니다.");
  }
  return value;
}

function normalizeMovementLevel(
  value: unknown,
): "near" | "short" | "half" {
  if (value !== "near" && value !== "short" && value !== "half") {
    throw new Error("이동 거리 단계를 확인해주세요.");
  }
  return value;
}

function normalizeMoodTags(value: unknown) {
  if (!Array.isArray(value)) throw new Error("분위기 태그를 확인해주세요.");

  const tags = [...new Set(
    value
      .filter((tag): tag is string => typeof tag === "string")
      .map((tag) => tag.trim().slice(0, 30))
      .filter(Boolean),
  )].slice(0, 8);

  if (tags.length === 0) throw new Error("분위기 태그를 하나 이상 입력해주세요.");
  return tags;
}

function normalizePlaceIds(value: unknown) {
  if (!Array.isArray(value)) return [];

  return [...new Set(
    value
      .filter((placeId): placeId is string => typeof placeId === "string")
      .map((placeId) => placeId.trim().slice(0, 160))
      .filter(Boolean),
  )].slice(0, 100);
}
