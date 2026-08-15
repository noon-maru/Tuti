import { createDeparturePlan } from "@/server/departure/departurePlan";
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
  DeparturePlanRequest,
  DeparturePlanResponse,
} from "@/shared/api/departurePlan";
import type { UserLocation } from "@/shared/tuti/types";

export const runtime = "nodejs";

type DeparturePlanRouteContext = {
  params: Promise<{ placeId: string }>;
};

export async function POST(
  request: Request,
  context: DeparturePlanRouteContext,
) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json(
      { error: "허용되지 않은 요청 출처예요." },
      { status: 403 },
    );
  }

  try {
    const user = await authenticateUser(request);
    const consent = await requireCurrentLocationConsent(user);
    const [{ placeId }, body] = await Promise.all([
      context.params,
      request.json() as Promise<unknown>,
    ]);
    const origin = normalizeLocation(
      (body as Partial<DeparturePlanRequest> | null)?.origin,
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

    const plan = await runWithLocationUsage({
      user: user!,
      consent,
      acquisitionSource: "device",
      service: "departure_plan",
      method: "POST /api/places/:placeId/departure-plan",
      operation: () => createDeparturePlan(placeId, origin),
    });
    if (!plan) {
      return withCors(
        request,
        Response.json(
          { error: "출발 정보를 제공할 장소를 찾지 못했어요." },
          { status: 404 },
        ),
      );
    }

    const response: DeparturePlanResponse = { plan };
    return withCors(request, Response.json(response));
  } catch (error) {
    const invalidJson = error instanceof SyntaxError;
    const complianceError =
      error instanceof LocationComplianceError ? error : null;

    if (!invalidJson && !complianceError) {
      console.error("출발 계획을 준비하지 못했습니다.", error);
    }

    return withCors(
      request,
      Response.json(
        {
          error: invalidJson
            ? "요청 본문을 확인해주세요."
            : complianceError?.message ?? "출발 계획을 준비하지 못했어요.",
          ...(complianceError ? { code: complianceError.code } : {}),
        },
        { status: invalidJson ? 400 : complianceError?.status ?? 500 },
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
