import { createDepartureNearbyPlaces } from "@/server/departure/departurePlan";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import type { DepartureNearbyResponse } from "@/shared/api/departurePlan";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ placeId: string }> };

export async function GET(request: Request, context: RouteContext) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json({ error: "허용되지 않은 요청 출처예요." }, { status: 403 });
  }
  try {
    const { placeId } = await context.params;
    const nearbyPlaces = await createDepartureNearbyPlaces(placeId);
    if (!nearbyPlaces) {
      return withCors(
        request,
        Response.json({ error: "장소를 찾지 못했어요." }, { status: 404 }),
      );
    }
    const response: DepartureNearbyResponse = { nearbyPlaces };
    return withCors(request, Response.json(response));
  } catch {
    return withCors(
      request,
      Response.json({ error: "주변 장소를 준비하지 못했어요." }, { status: 500 }),
    );
  }
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}
