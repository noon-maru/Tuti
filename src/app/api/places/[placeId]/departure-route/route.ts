import { createDepartureRoute } from "@/server/departure/departurePlan";
import { authenticateUser } from "@/server/auth/session";
import {
  LocationComplianceError,
  requireCurrentLocationConsent,
  runWithLocationUsage,
} from "@/server/location/compliance";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import type {
  DepartureRouteMode,
  DepartureRouteRequest,
  DepartureRouteResponse,
} from "@/shared/api/departurePlan";
import type { UserLocation } from "@/shared/tuti/types";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ placeId: string }> };

export async function POST(request: Request, context: RouteContext) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json({ error: "허용되지 않은 요청 출처예요." }, { status: 403 });
  }

  try {
    const user = await authenticateUser(request);
    const consent = await requireCurrentLocationConsent(user);
    const [{ placeId }, body] = await Promise.all([
      context.params,
      request.json() as Promise<unknown>,
    ]);
    const input = body as Partial<DepartureRouteRequest> | null;
    const origin = normalizeLocation(input?.origin);
    const mode = normalizeMode(input?.mode);
    if (!origin || !mode) {
      return withCors(
        request,
        Response.json({ error: "이동수단과 현재 위치를 확인해주세요." }, { status: 400 }),
      );
    }

    const route = await runWithLocationUsage({
      user: user!,
      consent,
      acquisitionSource: "device",
      service: "departure_plan",
      method: "POST /api/places/:placeId/departure-route",
      operation: () => createDepartureRoute(placeId, origin, mode),
    });
    if (!route) {
      return withCors(
        request,
        Response.json({ error: "이동 경로를 찾지 못했어요." }, { status: 404 }),
      );
    }
    const response: DepartureRouteResponse = { route };
    return withCors(request, Response.json(response));
  } catch (error) {
    const complianceError =
      error instanceof LocationComplianceError ? error : null;
    return withCors(
      request,
      Response.json(
        {
          error: complianceError?.message ?? "이동 경로를 준비하지 못했어요.",
          ...(complianceError ? { code: complianceError.code } : {}),
        },
        { status: complianceError?.status ?? 500 },
      ),
    );
  }
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}

function normalizeMode(value: unknown): DepartureRouteMode | null {
  return value === "publicTransit" ||
    value === "walking" ||
    value === "bicycle" ||
    value === "driving"
    ? value
    : null;
}

function normalizeLocation(location: unknown): UserLocation | null {
  if (!location || typeof location !== "object") return null;
  const latitude = Number((location as { latitude?: unknown }).latitude);
  const longitude = Number((location as { longitude?: unknown }).longitude);
  if (
    !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
    !Number.isFinite(longitude) || longitude < -180 || longitude > 180
  ) return null;
  return { latitude, longitude };
}
