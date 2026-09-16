import { getRecommendationRegionCatalog } from "@/server/recommendations/regionCatalog";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json(
      { error: "허용되지 않은 요청 출처예요." },
      { status: 403 },
    );
  }

  try {
    return withCors(
      request,
      Response.json(await getRecommendationRegionCatalog()),
    );
  } catch (error) {
    console.error("추천 지역 목록을 불러오지 못했습니다.", error);
    return withCors(
      request,
      Response.json(
        { error: "추천받을 지역을 불러오지 못했어요." },
        { status: 500 },
      ),
    );
  }
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}
