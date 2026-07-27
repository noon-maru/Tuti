import {
  createHmac,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { assertAccountAuthEnabled, getRequiredAuthEnv } from "@/server/auth/config";
import { sendEmailVerificationCode } from "@/server/auth/emailDelivery";
import {
  AccountAuthError,
  createAccessToken,
  createUserSession,
  hashAccessToken,
  type AuthenticatedUser,
} from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import type {
  AccountJournalResolution,
  EmailCodeRequest,
  EmailCodeVerification,
  EmailCodeVerificationResult,
} from "@/shared/api/session";

const CODE_LIFETIME_MINUTES = 10;
const REQUEST_WINDOW_MINUTES = 15;
const MAX_REQUESTS_PER_WINDOW = 5;
const MAX_VERIFICATION_ATTEMPTS = 5;

export async function requestEmailCode(input: EmailCodeRequest) {
  assertAccountAuthEnabled();
  const email = parseEmail(input);
  const requestWindowStart = minutesAgo(REQUEST_WINDOW_MINUTES);
  const recentRequestCount = await prisma.emailVerificationCode.count({
    where: {
      email,
      createdAt: { gte: requestWindowStart },
    },
  });

  if (recentRequestCount >= MAX_REQUESTS_PER_WINDOW) {
    throw new AccountAuthError(
      "잠시 후 인증코드를 다시 요청해주세요.",
      "email_code_rate_limited",
      429,
    );
  }

  const id = randomUUID();
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + CODE_LIFETIME_MINUTES);

  await prisma.$transaction([
    prisma.emailVerificationCode.updateMany({
      where: {
        email,
        consumedAt: null,
      },
      data: {
        consumedAt: new Date(),
      },
    }),
    prisma.emailVerificationCode.create({
      data: {
        id,
        email,
        codeHash: hashVerificationCode(id, email, code),
        expiresAt,
      },
    }),
  ]);

  try {
    await sendEmailVerificationCode(email, code);
  } catch (error) {
    await prisma.emailVerificationCode.deleteMany({ where: { id } });
    throw error;
  }

  return {
    expiresInSeconds: CODE_LIFETIME_MINUTES * 60,
    message: "인증코드를 보냈어요.",
  };
}

export async function verifyEmailCode(
  currentUser: AuthenticatedUser,
  input: EmailCodeVerification,
): Promise<EmailCodeVerificationResult> {
  assertAccountAuthEnabled();
  const email = parseEmail(input);
  const code = parseCode(input);
  const journalResolution = parseJournalResolution(input);
  const challenge = await prisma.emailVerificationCode.findFirst({
    where: {
      email,
      consumedAt: null,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (!challenge || challenge.expiresAt <= new Date()) {
    throw new AccountAuthError(
      "인증코드가 만료됐어요. 새 코드를 요청해주세요.",
      "email_code_expired",
      400,
    );
  }

  if (challenge.attempts >= MAX_VERIFICATION_ATTEMPTS) {
    throw new AccountAuthError(
      "입력 횟수를 초과했어요. 새 코드를 요청해주세요.",
      "email_code_attempts_exceeded",
      429,
    );
  }

  const expectedHash = Buffer.from(challenge.codeHash, "hex");
  const receivedHash = Buffer.from(
    hashVerificationCode(challenge.id, email, code),
    "hex",
  );
  const codeMatches =
    expectedHash.length === receivedHash.length &&
    timingSafeEqual(expectedHash, receivedHash);

  if (!codeMatches) {
    await prisma.emailVerificationCode.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    });

    throw new AccountAuthError(
      "인증코드를 확인해주세요.",
      "invalid_email_code",
      400,
    );
  }

  const existingIdentity = await prisma.authIdentity.findUnique({
    where: {
      provider_providerSubject: {
        provider: "email",
        providerSubject: email,
      },
    },
    select: {
      userId: true,
    },
  });

  if (
    existingIdentity &&
    existingIdentity.userId !== currentUser.id &&
    currentUser.account
  ) {
    throw new AccountAuthError(
      "현재 계정에서 로그아웃한 뒤 다시 시도해주세요.",
      "account_switch_requires_logout",
      409,
    );
  }

  const targetUserId = existingIdentity?.userId ?? currentUser.id;

  if (existingIdentity && existingIdentity.userId !== currentUser.id) {
    const currentJournalCount = await prisma.journalEntry.count({
      where: { ownerId: currentUser.id },
    });

    if (currentJournalCount > 0 && !journalResolution) {
      return {
        status: "journal-resolution-required",
        currentJournalCount,
      };
    }

    if (journalResolution === "merge") {
      await prisma.$transaction([
        prisma.journalEntry.updateMany({
          where: { ownerId: currentUser.id },
          data: { ownerId: existingIdentity.userId },
        }),
        prisma.journalShareTrace.updateMany({
          where: { resolvedUserId: currentUser.id },
          data: { resolvedUserId: existingIdentity.userId },
        }),
        prisma.emailVerificationCode.update({
          where: { id: challenge.id },
          data: { consumedAt: new Date() },
        }),
        prisma.user.delete({
          where: { id: currentUser.id },
        }),
      ]);
    } else {
      await prisma.$transaction([
        prisma.emailVerificationCode.update({
          where: { id: challenge.id },
          data: { consumedAt: new Date() },
        }),
        prisma.user.delete({
          where: { id: currentUser.id },
        }),
      ]);
    }
  } else {
    await prisma.$transaction([
      prisma.authIdentity.upsert({
        where: {
          provider_providerSubject: {
            provider: "email",
            providerSubject: email,
          },
        },
        update: { email },
        create: {
          id: randomUUID(),
          userId: currentUser.id,
          provider: "email",
          providerSubject: email,
          email,
        },
      }),
      prisma.emailVerificationCode.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date() },
      }),
      prisma.user.update({
        where: { id: currentUser.id },
        data: {
          tokenHash: hashAccessToken(createAccessToken()),
        },
      }),
    ]);
  }

  return {
    status: "authenticated",
    session: await createUserSession(targetUserId),
  };
}

function parseEmail(input: EmailCodeRequest) {
  const email =
    typeof input?.email === "string" ? input.email.trim().toLowerCase() : "";

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new AccountAuthError(
      "이메일 형식을 확인해주세요.",
      "invalid_email",
      400,
    );
  }

  return email;
}

function parseCode(input: EmailCodeVerification) {
  const code = typeof input?.code === "string" ? input.code.trim() : "";

  if (!/^\d{6}$/.test(code)) {
    throw new AccountAuthError(
      "6자리 인증코드를 입력해주세요.",
      "invalid_email_code_format",
      400,
    );
  }

  return code;
}

function parseJournalResolution(
  input: EmailCodeVerification,
): AccountJournalResolution | undefined {
  const resolution = input?.journalResolution;

  if (
    resolution === undefined ||
    resolution === "merge" ||
    resolution === "discard"
  ) {
    return resolution;
  }

  throw new AccountAuthError(
    "현재 기록을 처리할 방법을 다시 선택해주세요.",
    "invalid_journal_resolution",
    400,
  );
}

function hashVerificationCode(id: string, email: string, code: string) {
  return createHmac(
    "sha256",
    getRequiredAuthEnv("AUTH_EMAIL_CODE_SECRET"),
  )
    .update(`${id}:${email}:${code}`)
    .digest("hex");
}

function minutesAgo(minutes: number) {
  return new Date(Date.now() - minutes * 60 * 1000);
}
