import { findNearbyAccommodations } from "@/server/accommodations/accommodationService";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ placeId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json(
      { error: "허용되지 않은 요청 출처예요." },
      { status: 403 },
    );
  }

  try {
    const { placeId } = await context.params;
    const result = await findNearbyAccommodations(placeId);
    if (!result) {
      return withCors(
        request,
        Response.json({ error: "장소를 찾지 못했어요." }, { status: 404 }),
      );
    }
    return withCors(request, Response.json(result));
  } catch (error) {
    console.error("주변 숙박 정보를 준비하지 못했습니다.", error);
    return withCors(
      request,
      Response.json(
        { error: "머물 곳을 준비하지 못했어요." },
        { status: 502 },
      ),
    );
  }
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}
