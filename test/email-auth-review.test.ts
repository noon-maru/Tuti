import assert from "node:assert/strict";
import test from "node:test";
import {
  AppReviewAuthConfigurationError,
  getAppReviewAuthConfig,
  isAppReviewEmail,
} from "../src/server/auth/appReview";

test("심사용 이메일과 자격증명을 모두 비우면 심사용 인증을 끈다", () => {
  assert.equal(getAppReviewAuthConfig({}), null);
  assert.equal(
    getAppReviewAuthConfig({
      AUTH_APP_REVIEW_EMAIL: "  ",
      AUTH_APP_REVIEW_PASSWORD: "  ",
      AUTH_APP_REVIEW_CODE: "  ",
    }),
    null,
  );
});

test("심사용 이메일을 정규화하고 구형 키와 무관하게 비밀번호만 사용한다", () => {
  const config = getAppReviewAuthConfig({
    AUTH_APP_REVIEW_EMAIL: " App-Review@TUTI.Today ",
    AUTH_APP_REVIEW_PASSWORD: " test-review-password! ",
    AUTH_APP_REVIEW_CODE: " 483921 ",
  });

  assert.deepEqual(config, {
    email: "app-review@tuti.today",
    credential: "test-review-password!",
    verificationMethod: "password",
  });
  assert.equal(isAppReviewEmail("app-review@tuti.today", config), true);
  assert.equal(isAppReviewEmail("user@example.com", config), false);
});

test("구형 심사 키는 무시하고 이메일에 비밀번호가 없으면 차단한다", () => {
  assert.equal(getAppReviewAuthConfig({ AUTH_APP_REVIEW_CODE: "483921" }), null);
  assert.throws(
    () => getAppReviewAuthConfig({
      AUTH_APP_REVIEW_EMAIL: "app-review@tuti.today",
      AUTH_APP_REVIEW_CODE: "483921",
    }),
    AppReviewAuthConfigurationError,
  );
});

test("심사용 자격증명이 일부만 있거나 형식이 잘못되면 차단한다", () => {
  const invalidEnvironments = [
    { AUTH_APP_REVIEW_EMAIL: "app-review@tuti.today" },
    { AUTH_APP_REVIEW_PASSWORD: "test-review-password!" },
    {
      AUTH_APP_REVIEW_EMAIL: "invalid-email",
      AUTH_APP_REVIEW_PASSWORD: "test-review-password!",
    },
    {
      AUTH_APP_REVIEW_EMAIL: "app-review@tuti.today",
      AUTH_APP_REVIEW_PASSWORD: "short",
    },
    {
      AUTH_APP_REVIEW_EMAIL: "app-review@tuti.today",
      AUTH_APP_REVIEW_PASSWORD: "x".repeat(129),
    },
    {
      AUTH_APP_REVIEW_EMAIL: "app-review@tuti.today",
      AUTH_APP_REVIEW_CODE: "password",
    },
  ];

  for (const environment of invalidEnvironments) {
    assert.throws(
      () => getAppReviewAuthConfig(environment),
      AppReviewAuthConfigurationError,
    );
  }
});

test("심사 계정의 6자리 입력은 챌린지 조회 전에 막고 일반 이메일 OTP는 유지한다", async t => {
  const globalForPrisma = globalThis as unknown as { prisma?: unknown };
  const previousPrisma = globalForPrisma.prisma;
  const auditCalls: Array<{ data: { metadata: { deliveryMode: string } } }> = [];
  const challenges = t.mock.fn(async () => null);
  globalForPrisma.prisma = {
    systemLog: { create: async (input: typeof auditCalls[number]) => { auditCalls.push(input); return {}; } },
    emailVerificationCode: { findFirst: challenges },
  };
  t.after(() => { globalForPrisma.prisma = previousPrisma; });
  const { verifyEmailCode } = await import("../src/server/auth/emailCode");
  const keys = ["ACCOUNT_AUTH_ENABLED", "AUTH_APP_REVIEW_EMAIL", "AUTH_APP_REVIEW_PASSWORD"] as const;
  const previous = keys.map(key => process.env[key]);
  t.after(() => keys.forEach((key, index) => {
    if (previous[index] === undefined) delete process.env[key];
    else process.env[key] = previous[index];
  }));
  process.env.ACCOUNT_AUTH_ENABLED = "true";
  process.env.AUTH_APP_REVIEW_EMAIL = "app-review@tuti.today";
  process.env.AUTH_APP_REVIEW_PASSWORD = "test-review-password!";

  const user = { id: "test-user", role: "user" as const };

  await assert.rejects(
    verifyEmailCode(user, { email: "app-review@tuti.today", code: "483921" }),
    { code: "invalid_app_review_password_format" },
  );
  assert.equal(challenges.mock.callCount(), 0);
  assert.equal(auditCalls[0].data.metadata.deliveryMode, "app_review_password");

  // 유효 길이 비밀번호는 정상 챌린지 경로에 진입한다. DB 대신 만료 상태로 응답한다.
  await assert.rejects(
    verifyEmailCode(user, { email: "app-review@tuti.today", code: "test-review-password!" }),
    { code: "email_code_expired" },
  );
  assert.equal(challenges.mock.callCount(), 1);

  await assert.rejects(
    verifyEmailCode(user, { email: "user@example.com", code: "483921" }),
    { code: "email_code_expired" },
  );
  assert.equal(challenges.mock.callCount(), 2);
  assert.equal(auditCalls[2].data.metadata.deliveryMode, "smtp");
});
