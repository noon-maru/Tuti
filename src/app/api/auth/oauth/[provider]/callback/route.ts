import {
  assertOAuthProvider,
  completeOAuthAuthorization,
} from "@/server/auth/oauth";
import { AccountAuthError } from "@/server/auth/session";

export const runtime = "nodejs";

type OAuthCallbackContext = {
  params: Promise<{ provider: string }>;
};

export async function GET(
  request: Request,
  context: OAuthCallbackContext,
) {
  return handleCallback(request, context);
}

export async function POST(
  request: Request,
  context: OAuthCallbackContext,
) {
  return handleCallback(request, context);
}

async function handleCallback(
  request: Request,
  context: OAuthCallbackContext,
) {
  try {
    const { provider } = await context.params;
    assertOAuthProvider(provider);
    const completionUrl = await completeOAuthAuthorization(
      request,
      provider,
    );

    return Response.redirect(completionUrl, 303);
  } catch (error) {
    const accountError =
      error instanceof AccountAuthError ? error : null;

    if (!accountError) {
      console.error("OAuth 콜백 처리 중 오류가 발생했습니다.", error);
    }

    const failureUrl = new URL(
      "/login",
      process.env.AUTH_PUBLIC_BASE_URL ?? request.url,
    );
    failureUrl.searchParams.set(
      "oauthError",
      accountError?.message ?? "OAuth 로그인을 완료하지 못했어요.",
    );
    return Response.redirect(failureUrl, 303);
  }
}
