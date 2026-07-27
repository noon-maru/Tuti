import { authenticateUser } from "@/server/auth/session";
import {
  finalizeJournalShareTrace,
  JournalShareTraceError,
  MAX_JOURNAL_SHARE_PNG_BYTES,
} from "@/server/journal/shareTrace";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import type { JournalShareTraceFinalizationResponse } from "@/shared/api/journal";

export const runtime = "nodejs";

type JournalShareTraceFinalizeRouteContext = {
  params: Promise<{ entryId: string; traceId: string }>;
};

export async function POST(
  request: Request,
  context: JournalShareTraceFinalizeRouteContext,
) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json(
      { error: "허용되지 않은 요청 출처예요." },
      { status: 403 },
    );
  }

  try {
    const user = await authenticateUser(request);

    if (!user) return unauthorizedResponse(request);

    if (
      request.headers.get("content-type")?.split(";", 1)[0]?.trim() !==
      "image/png"
    ) {
      throw new JournalShareTraceError(
        "공유 이미지는 PNG 파일이어야 해요.",
        "invalid_share_png_content_type",
        400,
      );
    }

    const contentLength = Number(
      request.headers.get("content-length") ?? 0,
    );

    if (
      Number.isFinite(contentLength) &&
      contentLength > MAX_JOURNAL_SHARE_PNG_BYTES
    ) {
      throw new JournalShareTraceError(
        "공유 이미지 용량이 너무 커요.",
        "share_png_too_large",
        413,
      );
    }

    const [{ entryId, traceId }, body] = await Promise.all([
      context.params,
      request.arrayBuffer(),
    ]);

    if (body.byteLength > MAX_JOURNAL_SHARE_PNG_BYTES) {
      throw new JournalShareTraceError(
        "공유 이미지 용량이 너무 커요.",
        "share_png_too_large",
        413,
      );
    }

    const trace = await finalizeJournalShareTrace({
      ownerId: user.id,
      entryId,
      traceId,
      png: new Uint8Array(body),
    });

    if (!trace) {
      return withCors(
        request,
        Response.json(
          { error: "완료할 공유 이미지 추적 기록을 찾지 못했어요." },
          { status: 404 },
        ),
      );
    }

    const response: JournalShareTraceFinalizationResponse = { trace };
    return withCors(request, Response.json(response));
  } catch (error) {
    const traceError =
      error instanceof JournalShareTraceError ? error : null;

    if (!traceError) {
      console.error("공유 이미지 추적 정보를 완료하지 못했습니다.", error);
    }

    return withCors(
      request,
      Response.json(
        {
          error:
            traceError?.message ??
            "공유 이미지 추적 정보를 완료하지 못했어요.",
          ...(traceError ? { code: traceError.code } : {}),
        },
        { status: traceError?.status ?? 500 },
      ),
    );
  }
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}

function unauthorizedResponse(request: Request) {
  return withCors(
    request,
    Response.json(
      { error: "사용자 인증이 필요해요." },
      { status: 401 },
    ),
  );
}
