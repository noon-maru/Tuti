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
import {
  createNativeOAuthCallbackUrl,
  NATIVE_OAUTH_RETURN_TO,
} from "@/shared/auth/nativeOAuth";
import {
  AppleOAuthError,
  createAppleClientSecret,
  encryptAppleRefreshToken,
  verifyAppleIdentityToken,
} from "@/server/auth/appleOAuth";
import { readOAuthCallbackParameters } from "@/server/auth/oauthCallback";
import { mergeUserIntoCurrentAccount } from "@/server/auth/accountMerge";
import {
  formatKoreanOrderedName,
  normalizeAccountDisplayName,
} from "@/shared/auth/displayName";

const OAUTH_LIFETIME_MINUTES = 10;

const providerConfigurations: Record<
  OAuthProvider,
  {
    authorizationEndpoint: string;
    clientIdEnv: string;
    enabledEnv: string;
    scopeSeparator?: string;
    baseScopes: string[];
    displayNameScopes: string[];
  }
> = {
  apple: {
    authorizationEndpoint: "https://appleid.apple.com/auth/authorize",
    clientIdEnv: "APPLE_CLIENT_ID",
    enabledEnv: "APPLE_OAUTH_ENABLED",
    baseScopes: ["email"],
    displayNameScopes: ["name"],
  },
  google: {
    authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    clientIdEnv: "GOOGLE_CLIENT_ID",
    enabledEnv: "GOOGLE_OAUTH_ENABLED",
    baseScopes: ["openid", "email"],
    displayNameScopes: ["profile"],
  },
  kakao: {
    authorizationEndpoint: "https://kauth.kakao.com/oauth/authorize",
    clientIdEnv: "KAKAO_REST_API_KEY",
    enabledEnv: "KAKAO_OAUTH_ENABLED",
    scopeSeparator: ",",
    baseScopes: ["account_email"],
    displayNameScopes: ["profile_nickname"],
  },
};

export async function createOAuthAuthorization(
  currentUser: AuthenticatedUser,
  provider: OAuthProvider,
  returnTo = "/",
  native = false,
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
  const collectDisplayName = !currentUser.account;

  await prisma.oAuthAuthorization.deleteMany({
    where: { expiresAt: { lte: new Date() } },
  });

  await prisma.oAuthAuthorization.create({
    data: {
      id: randomUUID(),
      userId: currentUser.id,
      provider,
      collectDisplayName,
      stateHash: hashAccessToken(state),
      codeVerifier,
      returnTo: native
        ? NATIVE_OAUTH_RETURN_TO
        : sanitizeReturnTo(returnTo),
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
  const scopes = getOAuthScopes(provider, collectDisplayName);
  if (scopes.length > 0) {
    authorizationUrl.searchParams.set(
      "scope",
      scopes.join(configuration.scopeSeparator ?? " "),
    );
  }
  authorizationUrl.searchParams.set("state", state);
  if (provider === "apple") {
    authorizationUrl.searchParams.set("response_mode", "form_post");
    authorizationUrl.searchParams.set("nonce", codeChallenge);
  } else {
    authorizationUrl.searchParams.set("code_challenge", codeChallenge);
    authorizationUrl.searchParams.set("code_challenge_method", "S256");
  }

  return authorizationUrl.toString();
}

export function getOAuthScopes(
  provider: OAuthProvider,
  collectDisplayName: boolean,
) {
  const configuration = providerConfigurations[provider];

  return [
    ...configuration.baseScopes,
    ...(collectDisplayName ? configuration.displayNameScopes : []),
  ];
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

  const callbackParameters = await readOAuthCallbackParameters(request);
  const providerError = callbackParameters.get("error");

  if (providerError) {
    const providerLabel = getOAuthProviderLabel(provider);

    throw new AccountAuthError(
      providerError === "access_denied" ||
        providerError === "user_cancelled_authorize"
        ? `${providerLabel} 로그인이 취소됐어요.`
        : `${providerLabel} 로그인을 완료하지 못했어요.`,
      `${provider}_${providerError}`,
      400,
    );
  }

  const state = callbackParameters.get("state")?.trim();
  const code = callbackParameters.get("code")?.trim();

  if (!state || !code) {
    throw new AccountAuthError(
      `${getOAuthProviderLabel(provider)} 로그인 응답을 확인하지 못했어요.`,
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

  const profile =
    provider === "apple"
      ? await fetchAppleProfile(
          code,
          authorization.codeVerifier,
          authorization.collectDisplayName
            ? parseAppleDisplayName(callbackParameters.get("user"))
            : null,
        )
      : provider === "google"
        ? await fetchGoogleProfile(
            code,
            authorization.codeVerifier,
            authorization.collectDisplayName,
          )
        : await fetchKakaoProfile(
            code,
            authorization.codeVerifier,
            authorization.collectDisplayName,
          );
  const completionToken = randomBytes(32).toString("base64url");

  await prisma.oAuthAuthorization.update({
    where: { id: authorization.id },
    data: {
      providerSubject: profile.subject,
      providerEmail: profile.email,
      providerDisplayName: profile.displayName,
      providerRefreshTokenEncrypted:
        profile.providerRefreshTokenEncrypted,
      completionTokenHash: hashAccessToken(completionToken),
      completedAt: new Date(),
    },
  });

  return createOAuthCompletionUrl(
    authorization.returnTo,
    "oauthTicket",
    completionToken,
  );
}

export async function createOAuthFailureUrl(
  request: Request,
  message: string,
) {
  const callbackParameters = await readOAuthCallbackParameters(request);
  const state = callbackParameters.get("state")?.trim();
  const authorization = state
    ? await prisma.oAuthAuthorization.findUnique({
        where: { stateHash: hashAccessToken(state) },
        select: { returnTo: true },
      })
    : null;

  return createOAuthCompletionUrl(
    authorization?.returnTo ?? "/",
    "oauthError",
    message,
  );
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
      providerDisplayName: true,
      collectDisplayName: true,
      providerRefreshTokenEncrypted: true,
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
    select: { id: true, userId: true },
  });
  let targetUserId = authorization.userId;

  if (
    existingIdentity &&
    existingIdentity.userId !== authorization.userId
  ) {
    if (authorization.user.authIdentities.length > 0) {
      await mergeUserIntoCurrentAccount({
        sourceUserId: existingIdentity.userId,
        targetUserId: authorization.userId,
        oauthAuthorizationId: authorization.id,
        identityUpdate: {
          identityId: existingIdentity.id,
          ...(authorization.providerEmail
            ? { email: authorization.providerEmail }
            : {}),
          ...(authorization.providerRefreshTokenEncrypted
            ? {
                providerRefreshTokenEncrypted:
                  authorization.providerRefreshTokenEncrypted,
              }
            : {}),
        },
      });

      return {
        status: "authenticated" as const,
        linked: true,
        session: await createUserSession(authorization.userId),
      };
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

    const identityUpdate = prisma.authIdentity.update({
      where: { id: existingIdentity.id },
      data: {
        ...(authorization.providerEmail
          ? { email: authorization.providerEmail }
          : {}),
        ...(authorization.providerRefreshTokenEncrypted
          ? {
              providerRefreshTokenEncrypted:
                authorization.providerRefreshTokenEncrypted,
            }
          : {}),
      },
    });

    if (journalResolution === "merge") {
      await prisma.$transaction([
        identityUpdate,
        prisma.journalEntry.updateMany({
          where: { ownerId: authorization.userId },
          data: { ownerId: targetUserId },
        }),
        prisma.journalShareTrace.updateMany({
          where: { resolvedUserId: authorization.userId },
          data: { resolvedUserId: targetUserId },
        }),
        prisma.customerInquiry.updateMany({
          where: { requesterUserId: authorization.userId },
          data: { requesterUserId: targetUserId },
        }),
        prisma.recommendationAction.updateMany({
          where: { userId: authorization.userId },
          data: { userId: targetUserId },
        }),
        prisma.recommendationRun.updateMany({
          where: { userId: authorization.userId },
          data: { userId: targetUserId },
        }),
        prisma.locationUsageLog.updateMany({
          where: { userId: authorization.userId },
          data: { userId: targetUserId },
        }),
        prisma.userSignalProfile.deleteMany({
          where: { userId: authorization.userId },
        }),
        prisma.user.delete({
          where: { id: authorization.userId },
        }),
      ]);
    } else {
      await prisma.$transaction([
        identityUpdate,
        prisma.customerInquiry.updateMany({
          where: { requesterUserId: authorization.userId },
          data: { requesterUserId: targetUserId },
        }),
        prisma.user.delete({
          where: { id: authorization.userId },
        }),
      ]);
    }
  } else {
    const initialDisplayName = authorization.collectDisplayName
      ? authorization.providerDisplayName
      : null;

    await prisma.$transaction([
      prisma.authIdentity.upsert({
        where: {
          provider_providerSubject: {
            provider: authorization.provider,
            providerSubject: authorization.providerSubject,
          },
        },
        update: {
          ...(authorization.providerEmail
            ? { email: authorization.providerEmail }
            : {}),
          ...(authorization.providerRefreshTokenEncrypted
            ? {
                providerRefreshTokenEncrypted:
                  authorization.providerRefreshTokenEncrypted,
              }
            : {}),
        },
        create: {
          id: randomUUID(),
          userId: authorization.userId,
          provider: authorization.provider,
          providerSubject: authorization.providerSubject,
          email: authorization.providerEmail,
          providerRefreshTokenEncrypted:
            authorization.providerRefreshTokenEncrypted,
        },
      }),
      ...(initialDisplayName
        ? [
            prisma.user.updateMany({
              where: { id: authorization.userId, displayName: null },
              data: { displayName: initialDisplayName },
            }),
          ]
        : []),
      prisma.oAuthAuthorization.delete({
        where: { id: authorization.id },
      }),
    ]);
  }

  return {
    status: "authenticated" as const,
    ...(!authorization.collectDisplayName ? { linked: true } : {}),
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

function createOAuthCompletionUrl(
  returnTo: string,
  parameter: "oauthTicket" | "oauthError",
  value: string,
) {
  if (returnTo === NATIVE_OAUTH_RETURN_TO) {
    return createNativeOAuthCallbackUrl(parameter, value);
  }

  const completionUrl = new URL(
    "/login",
    getRequiredAuthEnv("AUTH_PUBLIC_BASE_URL"),
  );
  completionUrl.searchParams.set(parameter, value);
  return completionUrl.toString();
}

function assertOAuthProviderEnabled(provider: OAuthProvider) {
  if (process.env.SOCIAL_OAUTH_ENABLED !== "true") {
    throw new AccountAuthError(
      "소셜 로그인을 준비하고 있어요.",
      "social_oauth_disabled",
      503,
    );
  }

  const configuration = providerConfigurations[provider];

  if (process.env[configuration.enabledEnv] === "true") return;

  throw new AccountAuthError(
    `${provider} 로그인을 준비하고 있어요.`,
    "oauth_provider_disabled",
    503,
  );
}

type OAuthProfile = {
  subject: string;
  email: string | null;
  displayName: string | null;
  providerRefreshTokenEncrypted?: string;
};

async function fetchAppleProfile(
  code: string,
  codeVerifier: string,
  displayName: string | null,
): Promise<OAuthProfile> {
  const clientId = getRequiredAuthEnv("APPLE_CLIENT_ID");
  const clientSecret = createAppleClientSecret({
    clientId,
    teamId: getRequiredAuthEnv("APPLE_TEAM_ID"),
    keyId: getRequiredAuthEnv("APPLE_KEY_ID"),
    privateKey: getRequiredAuthEnv("APPLE_PRIVATE_KEY"),
  });
  const tokenResponse = await fetch("https://appleid.apple.com/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: createOAuthCallbackUrl("apple"),
    }),
    cache: "no-store",
  });
  const tokenData = (await tokenResponse.json().catch(() => null)) as {
    id_token?: unknown;
    refresh_token?: unknown;
    error?: unknown;
  } | null;
  const identityToken =
    typeof tokenData?.id_token === "string" ? tokenData.id_token : "";
  const refreshToken =
    typeof tokenData?.refresh_token === "string"
      ? tokenData.refresh_token
      : "";

  if (!tokenResponse.ok || !identityToken || !refreshToken) {
    console.error("Apple OAuth 토큰 교환에 실패했습니다.", {
      error:
        typeof tokenData?.error === "string"
          ? tokenData.error
          : "unknown",
      status: tokenResponse.status,
    });
    throw new AccountAuthError(
      "Apple 로그인을 완료하지 못했어요.",
      "apple_token_exchange_failed",
      502,
    );
  }

  try {
    const profile = await verifyAppleIdentityToken(identityToken, {
      clientId,
      nonce: createHash("sha256").update(codeVerifier).digest("base64url"),
    });
    return {
      ...profile,
      displayName,
      providerRefreshTokenEncrypted: encryptAppleRefreshToken(
        refreshToken,
        getRequiredAuthEnv("APPLE_TOKEN_ENCRYPTION_KEY"),
      ),
    };
  } catch (error) {
    if (!(error instanceof AppleOAuthError)) throw error;

    throw new AccountAuthError(
      "Apple 계정 정보를 확인하지 못했어요.",
      error.code,
      502,
    );
  }
}

async function fetchGoogleProfile(
  code: string,
  codeVerifier: string,
  collectDisplayName: boolean,
): Promise<OAuthProfile> {
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
    name?: unknown;
    given_name?: unknown;
    family_name?: unknown;
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
    displayName: collectDisplayName
      ? formatKoreanOrderedName(
          profile?.given_name,
          profile?.family_name,
          profile?.name,
        )
      : null,
    email:
      profile?.email_verified === true &&
      typeof profile.email === "string"
        ? profile.email.trim().toLowerCase()
        : null,
  };
}

async function fetchKakaoProfile(
  code: string,
  codeVerifier: string,
  collectDisplayName: boolean,
): Promise<OAuthProfile> {
  const redirectUri = createOAuthCallbackUrl("kakao");
  const clientId = getRequiredAuthEnv("KAKAO_REST_API_KEY");
  const tokenResponse = await fetch("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: getRequiredAuthEnv("KAKAO_CLIENT_SECRET"),
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
    error_description?: unknown;
  } | null;
  const accessToken =
    typeof tokenData?.access_token === "string"
      ? tokenData.access_token
      : "";

  if (!tokenResponse.ok || !accessToken) {
    console.error("Kakao OAuth 토큰 교환에 실패했습니다.", {
      error:
        typeof tokenData?.error === "string"
          ? tokenData.error
          : "unknown",
      status: tokenResponse.status,
    });
    throw new AccountAuthError(
      "Kakao 로그인을 완료하지 못했어요.",
      "kakao_token_exchange_failed",
      502,
    );
  }

  const profileResponse = await fetch(
    "https://kapi.kakao.com/v2/user/me",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
      },
      body: new URLSearchParams({
        property_keys: JSON.stringify(
          collectDisplayName
            ? [
                "kakao_account.profile.nickname",
                "kakao_account.email",
              ]
            : ["kakao_account.email"],
        ),
      }),
      cache: "no-store",
    },
  );
  const profile = (await profileResponse.json().catch(() => null)) as {
    id?: unknown;
    properties?: {
      nickname?: unknown;
    };
    kakao_account?: {
      email?: unknown;
      is_email_valid?: unknown;
      is_email_verified?: unknown;
      profile?: {
        nickname?: unknown;
      };
    };
  } | null;
  const subject =
    typeof profile?.id === "number" || typeof profile?.id === "string"
      ? String(profile.id)
      : "";

  if (!profileResponse.ok || !subject) {
    throw new AccountAuthError(
      "Kakao 계정 정보를 확인하지 못했어요.",
      "kakao_profile_failed",
      502,
    );
  }

  const account = profile?.kakao_account;
  return {
    subject,
    displayName: collectDisplayName
      ? normalizeAccountDisplayName(
          account?.profile?.nickname ?? profile?.properties?.nickname,
        )
      : null,
    email:
      account?.is_email_valid === true &&
      account.is_email_verified === true &&
      typeof account.email === "string"
        ? account.email.trim().toLowerCase()
        : null,
  };
}

export function parseAppleDisplayName(value: string | null) {
  if (!value || value.length > 4_096) return null;

  try {
    const payload = JSON.parse(value) as {
      name?: {
        firstName?: unknown;
        lastName?: unknown;
      };
    };
    return formatKoreanOrderedName(
      payload?.name?.firstName,
      payload?.name?.lastName,
    );
  } catch {
    return null;
  }
}

function getOAuthProviderLabel(provider: OAuthProvider) {
  if (provider === "google") return "Google";
  if (provider === "kakao") return "Kakao";
  return "Apple";
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
