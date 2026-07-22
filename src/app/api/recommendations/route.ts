import { createRecommendations } from "@/server/recommendations/service";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import type {
  RecommendationRequest,
  RecommendationResponse,
} from "@/shared/api/recommendations";
import type { UserLocation } from "@/shared/tuti/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json({ error: "허용되지 않은 요청 출처예요." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as RecommendationRequest;
    const places = await createRecommendations(
      body.answers ?? {},
      normalizeLocation(body.location),
      normalizeStateText(body.stateText),
    );
    const response: RecommendationResponse = { places };

    return withCors(request, Response.json(response));
  } catch (error) {
    const invalidJson = error instanceof SyntaxError;

    if (!invalidJson) {
      console.error("추천 API 처리 중 오류가 발생했습니다.", error);
    }

    return withCors(
      request,
      Response.json(
        {
          error: invalidJson
            ? "요청 본문을 확인해주세요."
            : "추천 데이터를 준비하지 못했어요.",
        },
        { status: invalidJson ? 400 : 500 },
      ),
    );
  }
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}

function normalizeLocation(location?: UserLocation) {
  if (!location) return undefined;

  const { latitude, longitude } = location;
  const isValidLatitude = Number.isFinite(latitude) && latitude >= -90 && latitude <= 90;
  const isValidLongitude = Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;

  if (!isValidLatitude || !isValidLongitude) {
    return undefined;
  }

  return { latitude, longitude };
}

function normalizeStateText(stateText?: string) {
  if (typeof stateText !== "string") return undefined;

  const trimmed = stateText.trim();

  return trimmed ? trimmed.slice(0, 400) : undefined;
}
