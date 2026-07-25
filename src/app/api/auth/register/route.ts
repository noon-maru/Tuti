import {
  AccountAuthError,
  authenticateUser,
  registerAccount,
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
  return handleAccountRequest(request, registerAccount);
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}

async function handleAccountRequest(
  request: Request,
  action: typeof registerAccount,
) {
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
      session: await action(currentUser, credentials),
    };

    return withCors(request, Response.json(response, { status: 201 }));
  } catch (error) {
    const accountError =
      error instanceof AccountAuthError ? error : null;

    if (!accountError && !(error instanceof SyntaxError)) {
      console.error("계정 생성 중 오류가 발생했습니다.", error);
    }

    return withCors(
      request,
      Response.json(
        {
          error:
            accountError?.message ??
            (error instanceof SyntaxError
              ? "입력 내용을 확인해주세요."
              : "계정을 만들지 못했어요."),
          code: accountError?.code,
        },
        { status: accountError?.status ?? (error instanceof SyntaxError ? 400 : 500) },
      ),
    );
  }
}
