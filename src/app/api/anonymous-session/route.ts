import { createAnonymousSession } from "@/server/auth/anonymousSession";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import type { AnonymousSessionResponse } from "@/shared/api/anonymousSession";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json(
      { error: "허용되지 않은 요청 출처예요." },
      { status: 403 },
    );
  }

  try {
    const response: AnonymousSessionResponse = {
      session: await createAnonymousSession(),
    };

    return withCors(
      request,
      Response.json(response, { status: 201 }),
    );
  } catch (error) {
    console.error("익명 사용자 생성 중 오류가 발생했습니다.", error);

    return withCors(
      request,
      Response.json(
        { error: "익명 사용자를 준비하지 못했어요." },
        { status: 500 },
      ),
    );
  }
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}
