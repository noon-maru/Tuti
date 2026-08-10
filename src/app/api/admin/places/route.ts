import { authenticateAdmin } from "@/server/admin/auth";
import { writeSystemLog } from "@/server/admin/log";
import { prisma } from "@/server/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import type { AdminPlacesResponse } from "@/shared/api/admin";
import {
  candidatePoolPlaceWhere,
} from "@/server/recommendations/recommendablePlaceWhere";

export const runtime = "nodejs";

const PAGE_SIZE = 50;

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
  const contentType = url.searchParams
    .get("contentType")
    ?.trim()
    .slice(0, 40);
  const sido = url.searchParams.get("sido")?.trim().slice(0, 80);
  const sigungu = url.searchParams.get("sigungu")?.trim().slice(0, 80);
  const visibility = normalizeVisibility(
    url.searchParams.get("visibility"),
  );
  const candidate = normalizeCandidateFilter(
    url.searchParams.get("candidate"),
  );
  const sort = normalizePlaceSort(url.searchParams.get("sort"));
  const page = normalizePage(url.searchParams.get("page"));
  const where: Prisma.PlaceWhereInput = {
    AND: [
      getCandidateWhere(candidate),
      {
        ...(reviewStatus ? { reviewStatus } : {}),
        ...(source ? { source } : {}),
        ...(contentType ? { sourceContentType: contentType } : {}),
        ...(sido ? { sourceSidoName: sido } : {}),
        ...(sigungu ? { sourceSigunguName: sigungu } : {}),
        ...(visibility !== undefined ? { isActive: visibility } : {}),
      },
      ...(query
        ? [{
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { id: { contains: query, mode: "insensitive" } },
            { source: { contains: query, mode: "insensitive" } },
            { sourceId: { contains: query, mode: "insensitive" } },
            {
              sourceAddress: {
                contains: query,
                mode: "insensitive",
              },
            },
            {
              sourceSidoName: {
                contains: query,
                mode: "insensitive",
              },
            },
            {
              sourceSigunguName: {
                contains: query,
                mode: "insensitive",
              },
            },
          ],
        } satisfies Prisma.PlaceWhereInput]
        : []),
    ],
  };
  const sigunguOptionWhere: Prisma.PlaceWhereInput = {
    sourceSigunguName: { not: null },
    ...(sido ? { sourceSidoName: sido } : {}),
  };
  const [
    places,
    total,
    all,
    statusGroups,
    visibilityGroups,
    sourceGroups,
    candidateStatusGroups,
    candidatePoolCount,
    contentTypeGroups,
    sidoGroups,
    sigunguGroups,
  ] = await Promise.all([
    prisma.place.findMany({
      where,
      select: {
        id: true,
        name: true,
        source: true,
        sourceId: true,
        sourceContentType: true,
        sourceAddress: true,
        sourceSidoName: true,
        sourceSigunguName: true,
        sourceCopyright: true,
        sourceSyncedAt: true,
        reviewStatus: true,
        isActive: true,
        visibilityOverride: true,
        candidateStatus: true,
        candidateScore: true,
        candidateOverride: true,
        candidateReasons: true,
        candidateExclusions: true,
        candidateEvaluatedAt: true,
        movementLevel: true,
        fatigue: true,
        updatedAt: true,
      },
      orderBy: getPlaceOrderBy(sort),
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.place.count({ where }),
    prisma.place.count(),
    prisma.place.groupBy({
      by: ["reviewStatus"],
      _count: { _all: true },
    }),
    prisma.place.groupBy({
      by: ["isActive"],
      _count: { _all: true },
    }),
    prisma.place.groupBy({
      by: ["source"],
      _count: { _all: true },
      orderBy: { source: "asc" },
    }),
    prisma.place.groupBy({
      by: ["candidateStatus"],
      _count: { _all: true },
    }),
    prisma.place.count({ where: candidatePoolPlaceWhere }),
    prisma.place.groupBy({
      by: ["sourceContentType"],
      where: { sourceContentType: { not: null } },
      _count: { _all: true },
      orderBy: { sourceContentType: "asc" },
    }),
    prisma.place.groupBy({
      by: ["sourceSidoName"],
      where: { sourceSidoName: { not: null } },
      _count: { _all: true },
      orderBy: { sourceSidoName: "asc" },
    }),
    prisma.place.groupBy({
      by: ["sourceSigunguName"],
      where: sigunguOptionWhere,
      _count: { _all: true },
      orderBy: { sourceSigunguName: "asc" },
    }),
  ]);
  const statusCounts = Object.fromEntries(
    statusGroups.map((group) => [
      group.reviewStatus,
      group._count._all,
    ]),
  );
  const visibilityCounts = Object.fromEntries(
    visibilityGroups.map((group) => [
      group.isActive ? "active" : "inactive",
      group._count._all,
    ]),
  );
  const candidateCounts = Object.fromEntries(
    candidateStatusGroups.map((group) => [
      group.candidateStatus,
      group._count._all,
    ]),
  );
  const response: AdminPlacesResponse = {
    places: places.map((place) => ({
      ...place,
      sourceSyncedAt: place.sourceSyncedAt?.toISOString() ?? null,
      candidateEvaluatedAt:
        place.candidateEvaluatedAt?.toISOString() ?? null,
      updatedAt: place.updatedAt.toISOString(),
    })),
    meta: {
      page,
      pageSize: PAGE_SIZE,
      total,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      all,
      statusCounts: {
        pending: statusCounts.pending ?? 0,
        approved: statusCounts.approved ?? 0,
        rejected: statusCounts.rejected ?? 0,
      },
      visibilityCounts: {
        active: visibilityCounts.active ?? 0,
        inactive: visibilityCounts.inactive ?? 0,
      },
      candidateCounts: {
        pool: candidatePoolCount,
        pending: candidateCounts.pending ?? 0,
        selected: candidateCounts.selected ?? 0,
        enrich: candidateCounts.enrich ?? 0,
        lowBurdenMismatch: candidateCounts.low_burden_mismatch ?? 0,
        invalid: candidateCounts.invalid ?? 0,
      },
      filters: {
        sources: sourceGroups.map((group) => ({
          value: group.source,
          label: getSourceLabel(group.source),
          count: group._count._all,
        })),
        contentTypes: contentTypeGroups.flatMap((group) =>
          group.sourceContentType
            ? [{
                value: group.sourceContentType,
                label: getContentTypeLabel(group.sourceContentType),
                count: group._count._all,
              }]
            : [],
        ),
        sidos: sidoGroups.flatMap((group) =>
          group.sourceSidoName
            ? [{
                value: group.sourceSidoName,
                label: group.sourceSidoName,
                count: group._count._all,
              }]
            : [],
        ),
        sigungus: sigunguGroups.flatMap((group) =>
          group.sourceSigunguName
            ? [{
                value: group.sourceSigunguName,
                label: group.sourceSigunguName,
                count: group._count._all,
              }]
            : [],
        ),
      },
    },
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
        ...(hasActiveValue
          ? {
              isActive: body.isActive as boolean,
              visibilityOverride: body.isActive
                ? ("show" as const)
                : ("hide" as const),
            }
          : {}),
        ...(editorial ?? {}),
      },
      select: {
        id: true,
        name: true,
        reviewStatus: true,
        isActive: true,
        visibilityOverride: true,
        candidateStatus: true,
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
        visibilityOverride: place.visibilityOverride,
        candidateStatus: place.candidateStatus,
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
        visibilityOverride:
          reviewStatus === "approved"
            ? "show"
            : reviewStatus === "rejected"
              ? "hide"
              : "auto",
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

function normalizeVisibility(value: unknown) {
  if (value === "active") return true;
  if (value === "inactive") return false;
  return undefined;
}

function normalizeCandidateFilter(value: unknown) {
  return value === "all" ||
    value === "selected" ||
    value === "pending" ||
    value === "enrich" ||
    value === "low_burden_mismatch" ||
    value === "invalid"
    ? value
    : "pool";
}

function getCandidateWhere(
  filter: ReturnType<typeof normalizeCandidateFilter>,
): Prisma.PlaceWhereInput {
  if (filter === "all") return {};
  if (filter === "pool") return candidatePoolPlaceWhere;
  return { candidateStatus: filter };
}

function normalizePage(value: unknown) {
  const page = typeof value === "string" ? Number.parseInt(value, 10) : 1;
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

function normalizePlaceSort(value: unknown) {
  return value === "updated-asc" ||
    value === "name-asc" ||
    value === "name-desc" ||
    value === "synced-desc" ||
    value === "fatigue-asc" ||
    value === "fatigue-desc"
    ? value
    : "updated-desc";
}

function getPlaceOrderBy(
  sort: ReturnType<typeof normalizePlaceSort>,
): Prisma.PlaceOrderByWithRelationInput[] {
  if (sort === "updated-asc") return [{ updatedAt: "asc" }, { name: "asc" }];
  if (sort === "name-asc") return [{ name: "asc" }, { updatedAt: "desc" }];
  if (sort === "name-desc") return [{ name: "desc" }, { updatedAt: "desc" }];
  if (sort === "synced-desc") {
    return [{ sourceSyncedAt: "desc" }, { updatedAt: "desc" }];
  }
  if (sort === "fatigue-asc") return [{ fatigue: "asc" }, { name: "asc" }];
  if (sort === "fatigue-desc") return [{ fatigue: "desc" }, { name: "asc" }];
  return [{ updatedAt: "desc" }, { name: "asc" }];
}

function getContentTypeLabel(value: string) {
  if (value === "12") return "관광지";
  if (value === "14") return "문화시설";
  if (value === "25") return "여행코스";
  if (value === "28") return "레포츠";
  return value;
}

function getSourceLabel(value: string) {
  if (value === "tourapi") return "한국관광공사 TourAPI";
  if (value === "manual") return "직접 등록";
  return value;
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
