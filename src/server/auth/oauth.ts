import { createHash, randomBytes, randomUUID } from "node:crypto";
import { assertAccountAuthEnabled, getRequiredAuthEnv } from "@/server/auth/config";
import {
  AccountAuthError,
  hashAccessToken,
  type AuthenticatedUser,
} from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import {
  authProviders,
  type OAuthProvider,
} from "@/shared/api/session";

const OAUTH_LIFETIME_MINUTES = 10;

const providerConfigurations: Record<
  OAuthProvider,
  {
    authorizationEndpoint: string;
    clientIdEnv: string;
    scopes: string[];
  }
> = {
  apple: {
    authorizationEndpoint: "https://appleid.apple.com/auth/authorize",
    clientIdEnv: "APPLE_CLIENT_ID",
    scopes: ["name", "email"],
  },
  google: {
    authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    clientIdEnv: "GOOGLE_CLIENT_ID",
    scopes: ["openid", "email", "profile"],
  },
  kakao: {
    authorizationEndpoint: "https://kauth.kakao.com/oauth/authorize",
    clientIdEnv: "KAKAO_CLIENT_ID",
    scopes: ["openid", "account_email"],
  },
};

export async function createOAuthAuthorization(
  currentUser: AuthenticatedUser,
  provider: OAuthProvider,
  returnTo = "/",
) {
  assertAccountAuthEnabled();
  const configuration = providerConfigurations[provider];
  const state = randomBytes(32).toString("base64url");
  const codeVerifier = randomBytes(48).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + OAUTH_LIFETIME_MINUTES);
  const redirectUri = createOAuthCallbackUrl(provider);

  await prisma.oauthAuthorization.create({
    data: {
      id: randomUUID(),
      userId: currentUser.id,
      provider,
      stateHash: hashAccessToken(state),
      codeVerifier,
      returnTo: sanitizeReturnTo(returnTo),
      expiresAt,
    },
  });

  const authorizationUrl = new URL(configuration.authorizationEndpoint);
  authorizationUrl.searchParams.set(
    "client_id",
    getRequiredAuthEnv(configuration.clientIdEnv),
  );
  authorizationUrl.searchParams.set("redirect_uri", redirectUri);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("scope", configuration.scopes.join(" "));
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("code_challenge", codeChallenge);
  authorizationUrl.searchParams.set("code_challenge_method", "S256");

  if (provider === "apple") {
    authorizationUrl.searchParams.set("response_mode", "form_post");
  }

  return authorizationUrl.toString();
}

export function assertOAuthProvider(
  value: string,
): asserts value is OAuthProvider {
  if ((authProviders as readonly string[]).includes(value)) return;

  throw new AccountAuthError(
    "지원하지 않는 로그인 공급자예요.",
    "unsupported_oauth_provider",
    404,
  );
}

export function completeOAuthAuthorization() {
  assertAccountAuthEnabled();

  throw new AccountAuthError(
    "OAuth 공급자 검증 연결을 준비하고 있어요.",
    "oauth_callback_disabled",
    503,
  );
}

function createOAuthCallbackUrl(provider: OAuthProvider) {
  const baseUrl = getRequiredAuthEnv("AUTH_PUBLIC_BASE_URL").replace(
    /\/+$/,
    "",
  );

  return `${baseUrl}/api/auth/oauth/${provider}/callback`;
}

function sanitizeReturnTo(returnTo: string) {
  return returnTo.startsWith("/") && !returnTo.startsWith("//")
    ? returnTo
    : "/";
}
