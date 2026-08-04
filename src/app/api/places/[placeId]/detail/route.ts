import { prisma } from "@/server/db/prisma";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import { ensureTourismPlaceDetail } from "@/server/tourism/enrichTourismPlaceDetail";
import type { PlaceDetailResponse } from "@/shared/api/placeDetails";

export const runtime = "nodejs";

type PlaceDetailRouteContext = {
  params: Promise<{ placeId: string }>;
};

export async function GET(
  request: Request,
  context: PlaceDetailRouteContext,
) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json(
      { error: "허용되지 않은 요청 출처예요." },
      { status: 403 },
    );
  }

  try {
    const { placeId } = await context.params;
    const place = await prisma.place.findFirst({
      where: {
        id: placeId,
        isActive: true,
        reviewStatus: "approved",
      },
      select: {
        id: true,
        name: true,
        sourceAddress: true,
        sourceSidoName: true,
        sourceSigunguName: true,
      },
    });

    if (!place) return notFoundResponse(request);

    const detail = await ensureTourismPlaceDetail(place.id);
    const response: PlaceDetailResponse = {
      place: {
        id: place.id,
        name: place.name,
        address: place.sourceAddress,
        region:
          [place.sourceSidoName, place.sourceSigunguName]
            .filter(Boolean)
            .join(" ") || null,
      },
      detail,
    };
    return withCors(request, Response.json(response));
  } catch (error) {
    console.error("관광지 상세정보를 준비하지 못했습니다.", error);

    return withCors(
      request,
      Response.json(
        { error: "장소의 상세정보를 준비하지 못했어요." },
        { status: 502 },
      ),
    );
  }
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}

function notFoundResponse(request: Request) {
  return withCors(
    request,
    Response.json(
      { error: "상세정보를 제공할 장소를 찾지 못했어요." },
      { status: 404 },
    ),
  );
}
