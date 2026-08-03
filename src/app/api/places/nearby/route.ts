import { prisma } from "@/server/db/prisma";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import type {
  NearbyPlacesRequest,
  NearbyPlacesResponse,
} from "@/shared/api/nearbyPlaces";
import type { UserLocation } from "@/shared/tuti/types";

export const runtime = "nodejs";

const SEARCH_RADIUS_METERS = 3_000;
const RESULT_LIMIT = 5;

type NearbyPlaceRow = {
  id: string;
  name: string;
  sourceSidoName: string | null;
  sourceSigunguName: string | null;
  distanceMeters: number;
};

export async function POST(request: Request) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json(
      { error: "허용되지 않은 요청 출처예요." },
      { status: 403 },
    );
  }

  try {
    const body = (await request.json()) as unknown;
    const location = normalizeLocation(
      (body as Partial<NearbyPlacesRequest> | null)?.location,
    );

    if (!location) {
      return withCors(
        request,
        Response.json(
          { error: "사진의 위치 정보를 확인해주세요." },
          { status: 400 },
        ),
      );
    }

    const places = await findNearbyPlaces(location);
    const response: NearbyPlacesResponse = {
      places: places.map((place) => ({
        id: place.id,
        name: place.name,
        region:
          [place.sourceSidoName, place.sourceSigunguName]
            .filter(Boolean)
            .join(" ") || null,
        distanceMeters: Math.max(0, Math.round(place.distanceMeters)),
      })),
    };

    return withCors(request, Response.json(response));
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      // 사진 좌표는 개인정보이므로 오류 객체나 요청 본문을 로그에 남기지 않는다.
      console.error("사진 주변 장소 검색 중 오류가 발생했습니다.");
    }

    return withCors(
      request,
      Response.json(
        {
          error:
            error instanceof SyntaxError
              ? "요청 본문을 확인해주세요."
              : "사진 주변의 장소를 찾지 못했어요.",
        },
        { status: error instanceof SyntaxError ? 400 : 500 },
      ),
    );
  }
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}

async function findNearbyPlaces({ latitude, longitude }: UserLocation) {
  return prisma.$queryRaw<NearbyPlaceRow[]>`
    WITH origin AS (
      SELECT ST_SetSRID(
        ST_MakePoint(${longitude}, ${latitude}),
        4326
      ) AS geometry
    )
    SELECT
      place."id",
      place."name",
      place."source_sido_name" AS "sourceSidoName",
      place."source_sigungu_name" AS "sourceSigunguName",
      ST_Distance(
        place."location"::geography,
        origin.geometry::geography
      ) AS "distanceMeters"
    FROM "places" AS place
    CROSS JOIN origin
    WHERE
      place."is_active" = true
      AND place."review_status" = 'approved'::"PlaceReviewStatus"
      AND place."location" IS NOT NULL
      AND ST_DWithin(
        place."location"::geography,
        origin.geometry::geography,
        ${SEARCH_RADIUS_METERS}
      )
    ORDER BY
      place."location" <-> origin.geometry,
      place."id" ASC
    LIMIT ${RESULT_LIMIT}
  `;
}

function normalizeLocation(location: unknown): UserLocation | null {
  if (!location || typeof location !== "object") return null;
  const latitude = Number((location as { latitude?: unknown }).latitude);
  const longitude = Number((location as { longitude?: unknown }).longitude);

  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  return { latitude, longitude };
}
