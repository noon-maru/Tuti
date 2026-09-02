import { createHash, randomBytes, randomUUID } from "node:crypto";
import { writeSystemLogSafely } from "@/server/admin/log";
import { prisma } from "@/server/db/prisma";
import { purgeExpiredAuthRecordsIfDue } from "@/server/auth/retention";
import type {
  AccountProfile,
  AuthProvider,
  TutiSession,
} from "@/shared/api/session";

const BEARER_PREFIX = "Bearer ";
const MINIMUM_TOKEN_LENGTH = 32;
const SESSION_LIFETIME_DAYS = 90;

type IdentityProfile = {
  id: string;
  email: string | null;
  provider: AuthProvider;
};

export type AuthenticatedUser = {
  id: string;
  role: "user" | "admin";
  account?: AccountProfile;
  sessionId?: string;
};

export async function createAnonymousSession(): Promise<TutiSession> {
  await purgeExpiredAuthRecordsIfDue();
  const accessToken = createAccessToken();
  const userId = randomUUID();

  await prisma.user.create({
    data: {
      id: userId,
      tokenHash: hashAccessToken(accessToken),
    },
  });

  return { accessToken, userId };
}

export async function authenticateUser(
  request: Request,
): Promise<AuthenticatedUser | null> {
  const accessToken = readBearerToken(request);

  if (!accessToken) return null;

  const tokenHash = hashAccessToken(accessToken);
  const anonymousUser = await prisma.user.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      displayName: true,
      role: true,
      authIdentities: {
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          email: true,
          provider: true,
        },
      },
    },
  });

  if (anonymousUser) {
    return {
      id: anonymousUser.id,
      role: anonymousUser.role,
      account: createAccountProfile(
        anonymousUser.displayName,
        anonymousUser.authIdentities,
        anonymousUser.role,
      ),
    };
  }

  const session = await prisma.userSession.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      expiresAt: true,
      user: {
        select: {
          id: true,
          displayName: true,
          role: true,
          authIdentities: {
            orderBy: { updatedAt: "desc" },
            select: {
              id: true,
              email: true,
              provider: true,
            },
          },
        },
      },
    },
  });

  if (!session) return null;

  if (session.expiresAt <= new Date()) {
    await prisma.userSession.delete({ where: { id: session.id } });
    return null;
  }

  return {
    id: session.user.id,
    role: session.user.role,
    account: createAccountProfile(
      session.user.displayName,
      session.user.authIdentities,
      session.user.role,
    ),
    sessionId: session.id,
  };
}

export async function createUserSession(userId: string) {
  const accessToken = createAccessToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_LIFETIME_DAYS);

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      displayName: true,
      role: true,
      authIdentities: {
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          email: true,
          provider: true,
        },
      },
    },
  });

  await prisma.userSession.create({
    data: {
      id: randomUUID(),
      userId,
      tokenHash: hashAccessToken(accessToken),
      expiresAt,
    },
  });

  const account = createAccountProfile(
    user.displayName,
    user.authIdentities,
    user.role,
  );

  await writeSystemLogSafely({
    category: "auth",
    action: "account.session.created",
    message: "계정 로그인 세션이 생성되었습니다.",
    actorUserId: userId,
    targetType: "user",
    targetId: userId,
    metadata: {
      providers: user.authIdentities
        .map((identity) => identity.provider)
        .join(","),
    },
  });

  return {
    accessToken,
    userId,
    ...(account ? { account } : {}),
  } satisfies TutiSession;
}

export async function logoutAccount(currentUser: AuthenticatedUser) {
  if (currentUser.sessionId) {
    await prisma.userSession.deleteMany({
      where: { id: currentUser.sessionId },
    });
  }

  return createAnonymousSession();
}

export function createAccessToken() {
  return randomBytes(32).toString("base64url");
}

export function hashAccessToken(accessToken: string) {
  return createHash("sha256").update(accessToken).digest("hex");
}

export function createAccountProfile(
  userDisplayName: string | null,
  identities: IdentityProfile[],
  role: "user" | "admin",
): AccountProfile | undefined {
  if (identities.length === 0) return undefined;

  const email = identities.find((identity) => identity.email)?.email;
  const providers = Array.from(
    new Set(identities.map((identity) => identity.provider)),
  );

  return {
    ...(email ? { email } : {}),
    ...(userDisplayName ? { displayName: userDisplayName } : {}),
    identities: identities.map((identity) => ({
      id: identity.id,
      provider: identity.provider,
      ...(identity.email ? { email: identity.email } : {}),
    })),
    providers,
    role,
  };
}

function readBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith(BEARER_PREFIX)) return null;

  const accessToken = authorization.slice(BEARER_PREFIX.length).trim();
  return accessToken.length >= MINIMUM_TOKEN_LENGTH ? accessToken : null;
}

export class AccountAuthError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
  }
}
