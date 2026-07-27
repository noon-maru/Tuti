import { authenticateAdmin } from "@/server/admin/auth";
import { writeSystemLogSafely } from "@/server/admin/log";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import { TourApiError } from "@/server/tourism/tourApiClient";
import { syncTourismPlaces } from "@/server/tourism/syncTourismPlaces";
import type { AdminTourApiSyncResponse } from "@/shared/api/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json(
      { error: "허용되지 않은 요청 출처예요." },
      { status: 403 },
    );
  }

  const authentication = await authenticateAdmin(request);

  if (!authentication.ok) {
    return withCors(request, authentication.response);
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      contentTypeId?: unknown;
      maxPages?: unknown;
      pageSize?: unknown;
    };
    const contentTypeId = normalizeContentTypeId(body.contentTypeId);
    const maxPages = normalizeInteger(body.maxPages, 1, 10, 3);
    const pageSize = normalizeInteger(body.pageSize, 1, 100, 100);
    const result = await syncTourismPlaces({
      contentTypeId,
      maxPages,
      pageSize,
    });
    const response: AdminTourApiSyncResponse = { result };

    await writeSystemLogSafely({
      category: "place",
      action: "place.tourapi.synced",
      message: `TourAPI 장소 ${result.received}건을 확인했습니다.`,
      actorUserId: authentication.user.id,
      targetType: "place-source",
      targetId: "tourapi",
      metadata: {
        contentTypeId: result.contentTypeId,
        pages: result.pages,
        received: result.received,
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
        failed: result.failed,
      },
    });

    return withCors(request, Response.json(response));
  } catch (error) {
    console.error("TourAPI 장소 동기화 중 오류가 발생했습니다.", error);

    const message =
      error instanceof TourApiError
        ? error.message
        : "TourAPI 장소를 가져오지 못했습니다.";
    const status =
      error instanceof TourApiError &&
      error.code === "tour_api_not_configured"
        ? 503
        : 502;

    return withCors(
      request,
      Response.json({ error: message }, { status }),
    );
  }
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}

function normalizeContentTypeId(value: unknown) {
  if (typeof value !== "string") return "12";
  const normalized = value.trim();
  return /^\d{1,4}$/.test(normalized) ? normalized : "12";
}

function normalizeInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number,
) {
  return typeof value === "number" && Number.isInteger(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback;
}
