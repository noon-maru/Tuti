import assert from "node:assert/strict";
import test from "node:test";

test("전역 소셜 OAuth 차단은 공급자 설정보다 우선한다", async (context) => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalAccountAuthEnabled = process.env.ACCOUNT_AUTH_ENABLED;
  const originalSocialOAuthEnabled = process.env.SOCIAL_OAUTH_ENABLED;
  const originalAppleOAuthEnabled = process.env.APPLE_OAUTH_ENABLED;

  context.after(() => {
    restoreEnv("DATABASE_URL", originalDatabaseUrl);
    restoreEnv("ACCOUNT_AUTH_ENABLED", originalAccountAuthEnabled);
    restoreEnv("SOCIAL_OAUTH_ENABLED", originalSocialOAuthEnabled);
    restoreEnv("APPLE_OAUTH_ENABLED", originalAppleOAuthEnabled);
  });

  process.env.DATABASE_URL =
    originalDatabaseUrl ??
    "postgresql://test:test@127.0.0.1:5432/tuti_test?schema=public";
  process.env.ACCOUNT_AUTH_ENABLED = "true";
  process.env.SOCIAL_OAUTH_ENABLED = "false";
  process.env.APPLE_OAUTH_ENABLED = "true";

  const [{ createOAuthAuthorization }, { AccountAuthError }] =
    await Promise.all([
      import("../src/server/auth/oauth"),
      import("../src/server/auth/session"),
    ]);

  await assert.rejects(
    createOAuthAuthorization(null as never, "apple"),
    (error) =>
      error instanceof AccountAuthError &&
      error.code === "social_oauth_disabled" &&
      error.status === 503,
  );
});

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
