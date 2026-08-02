import { prisma } from "@/server/db/prisma";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import type { PlaceSearchResponse } from "@/shared/api/placeSearch";

export const runtime = "nodejs";

const MAX_QUERY_LENGTH = 80;
const RESULT_LIMIT = 8;

export async function GET(request: Request) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json(
      { error: "허용되지 않은 요청 출처예요." },
      { status: 403 },
    );
  }

  try {
    const query = new URL(request.url).searchParams
      .get("q")
      ?.trim()
      .slice(0, MAX_QUERY_LENGTH);
    const places = await prisma.place.findMany({
      where: {
        isActive: true,
        reviewStatus: "approved",
        ...(query
          ? {
              OR: [
                { name: { contains: query, mode: "insensitive" } },
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
            }
          : {}),
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: RESULT_LIMIT,
      select: {
        id: true,
        name: true,
        sourceSidoName: true,
        sourceSigunguName: true,
      },
    });
    const response: PlaceSearchResponse = {
      places: places.map((place) => ({
        id: place.id,
        name: place.name,
        region:
          [place.sourceSidoName, place.sourceSigunguName]
            .filter(Boolean)
            .join(" ") || null,
      })),
    };

    return withCors(request, Response.json(response));
  } catch (error) {
    console.error("장소 검색 중 오류가 발생했습니다.", error);

    return withCors(
      request,
      Response.json(
        { error: "장소를 검색하지 못했어요." },
        { status: 500 },
      ),
    );
  }
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}
