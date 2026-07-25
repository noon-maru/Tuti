import { assertAccountAuthEnabled } from "@/server/auth/config";
import {
  assertOAuthProvider,
  createOAuthAuthorization,
} from "@/server/auth/oauth";
import {
  AccountAuthError,
  authenticateUser,
} from "@/server/auth/session";
import {
  createPreflightResponse,
  isRequestOriginAllowed,
  withCors,
} from "@/server/http/cors";
import type { OAuthStartResponse } from "@/shared/api/session";

export const runtime = "nodejs";

type OAuthStartContext = {
  params: Promise<{ provider: string }>;
};

export async function POST(
  request: Request,
  context: OAuthStartContext,
) {
  if (!isRequestOriginAllowed(request)) {
    return Response.json(
      { error: "허용되지 않은 요청 출처예요." },
      { status: 403 },
    );
  }

  try {
    assertAccountAuthEnabled();
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

    const { provider } = await context.params;
    assertOAuthProvider(provider);
    const input = (await request.json().catch(() => ({}))) as {
      returnTo?: unknown;
    };
    const response: OAuthStartResponse = {
      authorizationUrl: await createOAuthAuthorization(
        currentUser,
        provider,
        typeof input.returnTo === "string" ? input.returnTo : "/",
      ),
    };

    return withCors(request, Response.json(response));
  } catch (error) {
    const accountError =
      error instanceof AccountAuthError ? error : null;

    if (!accountError) {
      console.error("OAuth 로그인을 시작하지 못했습니다.", error);
    }

    return withCors(
      request,
      Response.json(
        {
          error: accountError?.message ?? "OAuth 로그인을 시작하지 못했어요.",
          code: accountError?.code,
        },
        { status: accountError?.status ?? 500 },
      ),
    );
  }
}

export function OPTIONS(request: Request) {
  return createPreflightResponse(request);
}
