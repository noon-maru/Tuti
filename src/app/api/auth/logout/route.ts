import {
  authenticateUser,
  logoutAccount,
} from "@/server/auth/session";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import type { SessionResponse } from "@/shared/api/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json(
      { error: "허용되지 않은 요청 출처예요." },
      { status: 403 },
    );
  }

  try {
    const currentUser = await authenticateUser(request);

    if (!currentUser) {
      return withCors(
        request,
        Response.json(
          { error: "사용자 인증이 필요해요." },
          { status: 401 },
        ),
      );
    }

    const response: SessionResponse = {
      session: await logoutAccount(currentUser),
    };

    return withCors(request, Response.json(response));
  } catch (error) {
    console.error("로그아웃 중 오류가 발생했습니다.", error);

    return withCors(
      request,
      Response.json(
        { error: "로그아웃하지 못했어요." },
        { status: 500 },
      ),
    );
  }
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}
