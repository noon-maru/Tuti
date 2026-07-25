import { assertAccountAuthEnabled } from "@/server/auth/config";
import { requestEmailCode } from "@/server/auth/emailCode";
import {
  AccountAuthError,
  authenticateUser,
} from "@/server/auth/session";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import type {
  EmailCodeRequest,
  EmailCodeRequestResponse,
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
    assertAccountAuthEnabled();
    const currentUser = await authenticateUser(request);

    if (!currentUser) return unauthorizedResponse(request);

    const input = (await request.json()) as EmailCodeRequest;
    const response: EmailCodeRequestResponse = await requestEmailCode(input);

    return withCors(request, Response.json(response));
  } catch (error) {
    return authErrorResponse(
      request,
      error,
      "인증코드를 보내지 못했어요.",
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

function authErrorResponse(
  request: Request,
  error: unknown,
  fallbackMessage: string,
) {
  const accountError =
    error instanceof AccountAuthError ? error : null;

  if (!accountError && !(error instanceof SyntaxError)) {
    console.error(fallbackMessage, error);
  }

  return withCors(
    request,
    Response.json(
      {
        error:
          accountError?.message ??
          (error instanceof SyntaxError
            ? "입력 내용을 확인해주세요."
            : fallbackMessage),
        code: accountError?.code,
      },
      {
        status:
          accountError?.status ??
          (error instanceof SyntaxError ? 400 : 500),
      },
    ),
  );
}
