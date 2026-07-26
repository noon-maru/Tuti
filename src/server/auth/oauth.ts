import { createHash, randomBytes, randomUUID } from "node:crypto";
import { assertAccountAuthEnabled, getRequiredAuthEnv } from "@/server/auth/config";
import {
  AccountAuthError,
  createUserSession,
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
    enabledEnv: string;
    scopes: string[];
  }
> = {
  apple: {
    authorizationEndpoint: "https://appleid.apple.com/auth/authorize",
    clientIdEnv: "APPLE_CLIENT_ID",
    enabledEnv: "APPLE_OAUTH_ENABLED",
    scopes: ["name", "email"],
  },
  google: {
    authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    clientIdEnv: "GOOGLE_CLIENT_ID",
    enabledEnv: "GOOGLE_OAUTH_ENABLED",
    scopes: ["openid", "email", "profile"],
  },
  kakao: {
    authorizationEndpoint: "https://kauth.kakao.com/oauth/authorize",
    clientIdEnv: "KAKAO_CLIENT_ID",
    enabledEnv: "KAKAO_OAUTH_ENABLED",
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
  assertOAuthProviderEnabled(provider);
  const state = randomBytes(32).toString("base64url");
  const codeVerifier = randomBytes(48).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + OAUTH_LIFETIME_MINUTES);
  const redirectUri = createOAuthCallbackUrl(provider);

  await prisma.oAuthAuthorization.deleteMany({
    where: { expiresAt: { lte: new Date() } },
  });

  await prisma.oAuthAuthorization.create({
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

export async function completeOAuthAuthorization(
  request: Request,
  provider: OAuthProvider,
) {
  assertAccountAuthEnabled();
  assertOAuthProviderEnabled(provider);

  if (provider !== "google") {
    throw new AccountAuthError(
      "선택한 로그인 공급자를 준비하고 있어요.",
      "oauth_provider_disabled",
      503,
    );
  }

  const callbackUrl = new URL(request.url);
  const providerError = callbackUrl.searchParams.get("error");

  if (providerError) {
    throw new AccountAuthError(
      providerError === "access_denied"
        ? "Google 로그인이 취소됐어요."
        : "Google 로그인을 완료하지 못했어요.",
      `google_${providerError}`,
      400,
    );
  }

  const state = callbackUrl.searchParams.get("state")?.trim();
  const code = callbackUrl.searchParams.get("code")?.trim();

  if (!state || !code) {
    throw new AccountAuthError(
      "Google 로그인 응답을 확인하지 못했어요.",
      "invalid_oauth_callback",
      400,
    );
  }

  const authorization = await prisma.oAuthAuthorization.findUnique({
    where: { stateHash: hashAccessToken(state) },
  });

  if (
    !authorization ||
    authorization.provider !== provider ||
    authorization.expiresAt <= new Date() ||
    authorization.completedAt
  ) {
    throw new AccountAuthError(
      "로그인 요청이 만료됐어요. 다시 시도해주세요.",
      "oauth_authorization_expired",
      400,
    );
  }

  const profile = await fetchGoogleProfile(
    code,
    authorization.codeVerifier,
  );
  const completionToken = randomBytes(32).toString("base64url");

  await prisma.oAuthAuthorization.update({
    where: { id: authorization.id },
    data: {
      providerSubject: profile.subject,
      providerEmail: profile.email,
      completionTokenHash: hashAccessToken(completionToken),
      completedAt: new Date(),
    },
  });

  const completionUrl = new URL(
    "/login",
    getRequiredAuthEnv("AUTH_PUBLIC_BASE_URL"),
  );
  completionUrl.searchParams.set("oauthTicket", completionToken);
  return completionUrl.toString();
}

export async function completeOAuthLogin(input: {
  ticket?: unknown;
  journalResolution?: unknown;
}) {
  assertAccountAuthEnabled();
  const ticket =
    typeof input?.ticket === "string" ? input.ticket.trim() : "";

  if (ticket.length < 32) {
    throw new AccountAuthError(
      "로그인 완료 요청을 확인하지 못했어요.",
      "invalid_oauth_completion_ticket",
      400,
    );
  }

  const journalResolution = parseJournalResolution(
    input.journalResolution,
  );
  const authorization = await prisma.oAuthAuthorization.findUnique({
    where: { completionTokenHash: hashAccessToken(ticket) },
    select: {
      id: true,
      userId: true,
      provider: true,
      providerSubject: true,
      providerEmail: true,
      completedAt: true,
      expiresAt: true,
      user: {
        select: {
          authIdentities: { select: { id: true } },
        },
      },
    },
  });

  if (
    !authorization ||
    !authorization.completedAt ||
    !authorization.providerSubject ||
    authorization.expiresAt <= new Date()
  ) {
    throw new AccountAuthError(
      "로그인 완료 요청이 만료됐어요. 다시 시도해주세요.",
      "oauth_completion_expired",
      400,
    );
  }

  const existingIdentity = await prisma.authIdentity.findUnique({
    where: {
      provider_providerSubject: {
        provider: authorization.provider,
        providerSubject: authorization.providerSubject,
      },
    },
    select: { userId: true },
  });
  let targetUserId = authorization.userId;

  if (
    existingIdentity &&
    existingIdentity.userId !== authorization.userId
  ) {
    if (authorization.user.authIdentities.length > 0) {
      throw new AccountAuthError(
        "현재 계정에서 로그아웃한 뒤 다시 시도해주세요.",
        "account_switch_requires_logout",
        409,
      );
    }

    const currentJournalCount = await prisma.journalEntry.count({
      where: { ownerId: authorization.userId },
    });

    if (currentJournalCount > 0 && !journalResolution) {
      return {
        status: "journal-resolution-required" as const,
        currentJournalCount,
      };
    }

    targetUserId = existingIdentity.userId;

    if (journalResolution === "merge") {
      await prisma.$transaction([
        prisma.journalEntry.updateMany({
          where: { ownerId: authorization.userId },
          data: { ownerId: targetUserId },
        }),
        prisma.user.delete({
          where: { id: authorization.userId },
        }),
      ]);
    } else {
      await prisma.user.delete({
        where: { id: authorization.userId },
      });
    }
  } else {
    await prisma.$transaction([
      prisma.authIdentity.upsert({
        where: {
          provider_providerSubject: {
            provider: authorization.provider,
            providerSubject: authorization.providerSubject,
          },
        },
        update: {
          email: authorization.providerEmail,
        },
        create: {
          id: randomUUID(),
          userId: authorization.userId,
          provider: authorization.provider,
          providerSubject: authorization.providerSubject,
          email: authorization.providerEmail,
        },
      }),
      prisma.oAuthAuthorization.delete({
        where: { id: authorization.id },
      }),
    ]);
  }

  return {
    status: "authenticated" as const,
    session: await createUserSession(targetUserId),
  };
}

function createOAuthCallbackUrl(provider: OAuthProvider) {
  const baseUrl = getRequiredAuthEnv("AUTH_PUBLIC_BASE_URL").replace(
    /\/+$/,
    "",
  );

  return `${baseUrl}/api/auth/oauth/${provider}/callback`;
}

function assertOAuthProviderEnabled(provider: OAuthProvider) {
  const configuration = providerConfigurations[provider];

  if (process.env[configuration.enabledEnv] === "true") return;

  throw new AccountAuthError(
    `${provider} 로그인을 준비하고 있어요.`,
    "oauth_provider_disabled",
    503,
  );
}

async function fetchGoogleProfile(
  code: string,
  codeVerifier: string,
) {
  const redirectUri = createOAuthCallbackUrl("google");
  const clientId = getRequiredAuthEnv("GOOGLE_CLIENT_ID");
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: getRequiredAuthEnv("GOOGLE_CLIENT_SECRET"),
      code,
      code_verifier: codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
    cache: "no-store",
  });
  const tokenData = (await tokenResponse.json().catch(() => null)) as {
    access_token?: unknown;
    error?: unknown;
  } | null;
  const accessToken =
    typeof tokenData?.access_token === "string"
      ? tokenData.access_token
      : "";

  if (!tokenResponse.ok || !accessToken) {
    console.error("Google OAuth 토큰 교환에 실패했습니다.", {
      error:
        typeof tokenData?.error === "string"
          ? tokenData.error
          : "unknown",
      status: tokenResponse.status,
    });
    throw new AccountAuthError(
      "Google 로그인을 완료하지 못했어요.",
      "google_token_exchange_failed",
      502,
    );
  }

  const profileResponse = await fetch(
    "https://openidconnect.googleapis.com/v1/userinfo",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    },
  );
  const profile = (await profileResponse.json().catch(() => null)) as {
    sub?: unknown;
    email?: unknown;
    email_verified?: unknown;
  } | null;
  const subject = typeof profile?.sub === "string" ? profile.sub : "";

  if (!profileResponse.ok || !subject) {
    throw new AccountAuthError(
      "Google 계정 정보를 확인하지 못했어요.",
      "google_profile_failed",
      502,
    );
  }

  return {
    subject,
    email:
      profile?.email_verified === true &&
      typeof profile.email === "string"
        ? profile.email.trim().toLowerCase()
        : null,
  };
}

function parseJournalResolution(value: unknown) {
  if (value === undefined || value === "merge" || value === "discard") {
    return value;
  }

  throw new AccountAuthError(
    "현재 기록을 처리할 방법을 다시 선택해주세요.",
    "invalid_journal_resolution",
    400,
  );
}

function sanitizeReturnTo(returnTo: string) {
  return returnTo.startsWith("/") && !returnTo.startsWith("//")
    ? returnTo
    : "/";
}
