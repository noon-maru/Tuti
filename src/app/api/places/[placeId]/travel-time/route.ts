import { createTravelTimeSummary } from "@/server/departure/travelTime";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import type {
  TravelTimeRequest,
  TravelTimeResponse,
} from "@/shared/api/travelTime";
import type { UserLocation } from "@/shared/tuti/types";

export const runtime = "nodejs";

type TravelTimeRouteContext = {
  params: Promise<{ placeId: string }>;
};

export async function POST(
  request: Request,
  context: TravelTimeRouteContext,
) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json(
      { error: "허용되지 않은 요청 출처예요." },
      { status: 403 },
    );
  }

  try {
    const [{ placeId }, body] = await Promise.all([
      context.params,
      request.json() as Promise<unknown>,
    ]);
    const origin = normalizeLocation(
      (body as Partial<TravelTimeRequest> | null)?.origin,
    );

    if (!origin) {
      return withCors(
        request,
        Response.json(
          { error: "현재 위치를 확인해주세요." },
          { status: 400 },
        ),
      );
    }

    const response: TravelTimeResponse = {
      summary: await createTravelTimeSummary(placeId, origin),
    };
    return withCors(request, Response.json(response));
  } catch (error) {
    const invalidJson = error instanceof SyntaxError;

    if (!invalidJson) {
      console.error("메인 카드 이동 시간을 준비하지 못했습니다.", error);
    }

    return withCors(
      request,
      Response.json(
        {
          error: invalidJson
            ? "요청 본문을 확인해주세요."
            : "이동 시간을 준비하지 못했어요.",
        },
        { status: invalidJson ? 400 : 500 },
      ),
    );
  }
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
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
