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
    };
    const placeId =
      typeof body.placeId === "string" ? body.placeId.trim() : "";
    const reviewStatus = normalizeReviewStatus(body.reviewStatus);
    const hasActiveValue = typeof body.isActive === "boolean";

    if (!placeId || (!reviewStatus && !hasActiveValue)) {
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
