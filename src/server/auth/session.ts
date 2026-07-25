import { createHash, randomBytes, randomUUID } from "node:crypto";
import { prisma } from "@/server/db/prisma";
import type {
  AccountCredentials,
  TutiSession,
} from "@/shared/api/session";
import { hashPassword, verifyPassword } from "@/server/auth/password";

const BEARER_PREFIX = "Bearer ";
const MINIMUM_TOKEN_LENGTH = 32;
const SESSION_LIFETIME_DAYS = 90;

export type AuthenticatedUser = {
  id: string;
  email: string | null;
  sessionId?: string;
};

export async function createAnonymousSession(): Promise<TutiSession> {
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
      email: true,
    },
  });

  if (anonymousUser) return anonymousUser;

  const session = await prisma.userSession.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      expiresAt: true,
      user: {
        select: {
          id: true,
          email: true,
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
    ...session.user,
    sessionId: session.id,
  };
}

export async function registerAccount(
  currentUser: AuthenticatedUser,
  credentials: AccountCredentials,
) {
  if (currentUser.email) {
    throw new AccountAuthError(
      "이미 계정에 연결되어 있어요.",
      "already_registered",
      409,
    );
  }

  const { email, password } = parseCredentials(credentials);

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existingUser) {
    throw new AccountAuthError(
      "이미 사용 중인 이메일이에요.",
      "email_in_use",
      409,
    );
  }

  const passwordHash = await hashPassword(password);

  await prisma.user.update({
    where: { id: currentUser.id },
    data: {
      email,
      passwordHash,
      tokenHash: hashAccessToken(createAccessToken()),
    },
  });

  return createUserSession(currentUser.id, email);
}

export async function loginAccount(
  currentUser: AuthenticatedUser,
  credentials: AccountCredentials,
) {
  const { email, password } = parseCredentials(credentials);

  const account = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      passwordHash: true,
    },
  });
  const passwordMatches =
    account?.passwordHash &&
    (await verifyPassword(password, account.passwordHash));

  if (!account?.email || !passwordMatches) {
    throw new AccountAuthError(
      "이메일 또는 비밀번호를 확인해주세요.",
      "invalid_credentials",
      401,
    );
  }

  if (currentUser.email && currentUser.id !== account.id) {
    throw new AccountAuthError(
      "현재 계정에서 로그아웃한 뒤 다시 시도해주세요.",
      "account_switch_requires_logout",
      409,
    );
  }

  if (currentUser.id !== account.id) {
    await prisma.$transaction([
      prisma.journalEntry.updateMany({
        where: { ownerId: currentUser.id },
        data: { ownerId: account.id },
      }),
      prisma.user.delete({
        where: { id: currentUser.id },
      }),
    ]);
  }

  return createUserSession(account.id, account.email);
}

export async function logoutAccount(currentUser: AuthenticatedUser) {
  if (currentUser.sessionId) {
    await prisma.userSession.deleteMany({
      where: { id: currentUser.sessionId },
    });
  }

  return createAnonymousSession();
}

async function createUserSession(userId: string, email: string) {
  const accessToken = createAccessToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_LIFETIME_DAYS);

  await prisma.userSession.create({
    data: {
      id: randomUUID(),
      userId,
      tokenHash: hashAccessToken(accessToken),
      expiresAt,
    },
  });

  return {
    accessToken,
    userId,
    account: { email },
  } satisfies TutiSession;
}

function parseCredentials(credentials: AccountCredentials) {
  if (
    !credentials ||
    typeof credentials.email !== "string" ||
    typeof credentials.password !== "string"
  ) {
    throw new AccountAuthError(
      "이메일과 비밀번호를 입력해주세요.",
      "invalid_credentials_input",
      400,
    );
  }

  const email = normalizeEmail(credentials.email);
  const password = credentials.password;
  const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);

  if (!emailValid) {
    throw new AccountAuthError(
      "이메일 형식을 확인해주세요.",
      "invalid_email",
      400,
    );
  }

  if (password.length < 8 || password.length > 128) {
    throw new AccountAuthError(
      "비밀번호는 8자 이상 128자 이하로 입력해주세요.",
      "invalid_password",
      400,
    );
  }

  return { email, password };
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function readBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith(BEARER_PREFIX)) return null;

  const accessToken = authorization.slice(BEARER_PREFIX.length).trim();
  return accessToken.length >= MINIMUM_TOKEN_LENGTH ? accessToken : null;
}

function createAccessToken() {
  return randomBytes(32).toString("base64url");
}

function hashAccessToken(accessToken: string) {
  return createHash("sha256").update(accessToken).digest("hex");
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
