import { assertAccountAuthEnabled } from "@/server/auth/config";
import { completeOAuthLogin } from "@/server/auth/oauth";
import { AccountAuthError } from "@/server/auth/session";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import type {
  OAuthCompletionRequest,
  OAuthCompletionResult,
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
    const input = (await request.json()) as OAuthCompletionRequest;
    const response: OAuthCompletionResult =
      await completeOAuthLogin(input);

    return withCors(request, Response.json(response));
  } catch (error) {
    const accountError =
      error instanceof AccountAuthError ? error : null;

    if (!accountError && !(error instanceof SyntaxError)) {
      console.error("OAuth 로그인을 완료하지 못했습니다.", error);
    }

    return withCors(
      request,
      Response.json(
        {
          error:
            accountError?.message ??
            (error instanceof SyntaxError
              ? "입력 내용을 확인해주세요."
              : "OAuth 로그인을 완료하지 못했어요."),
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
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}
