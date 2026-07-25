import {
  AccountAuthError,
  authenticateUser,
  loginAccount,
} from "@/server/auth/session";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import type {
  AccountCredentials,
  SessionResponse,
} from "@/shared/api/session";

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

    const credentials = (await request.json()) as AccountCredentials;
    const response: SessionResponse = {
      session: await loginAccount(currentUser, credentials),
    };

    return withCors(request, Response.json(response));
  } catch (error) {
    const accountError =
      error instanceof AccountAuthError ? error : null;

    if (!accountError && !(error instanceof SyntaxError)) {
      console.error("로그인 중 오류가 발생했습니다.", error);
    }

    return withCors(
      request,
      Response.json(
        {
          error:
            accountError?.message ??
            (error instanceof SyntaxError
              ? "입력 내용을 확인해주세요."
              : "로그인하지 못했어요."),
          code: accountError?.code,
        },
        { status: accountError?.status ?? (error instanceof SyntaxError ? 400 : 500) },
      ),
    );
  }
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}
