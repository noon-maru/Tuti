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

test("심사용 이메일을 정규화하고 비밀번호 로그인을 우선한다", () => {
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

test("기존 숫자 6자리 심사용 코드는 하위 호환한다", () => {
  assert.deepEqual(
    getAppReviewAuthConfig({
      AUTH_APP_REVIEW_EMAIL: "app-review@tuti.today",
      AUTH_APP_REVIEW_CODE: "483921",
    }),
    {
      email: "app-review@tuti.today",
      credential: "483921",
      verificationMethod: "code",
    },
  );
});

test("심사용 자격증명이 일부만 있거나 형식이 잘못되면 차단한다", () => {
  const invalidEnvironments = [
    { AUTH_APP_REVIEW_EMAIL: "app-review@tuti.today" },
    { AUTH_APP_REVIEW_PASSWORD: "test-review-password!" },
    { AUTH_APP_REVIEW_CODE: "483921" },
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
