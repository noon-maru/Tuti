import assert from "node:assert/strict";
import test from "node:test";

test("OAuth 표시 이름을 정규화하고 길이를 제한한다", async () => {
  const { normalizeAccountDisplayName } = await import(
    "../src/shared/auth/displayName"
  );

  assert.equal(normalizeAccountDisplayName("  튜티\n 사용자  "), "튜티 사용자");
  assert.equal(normalizeAccountDisplayName("ＡＢＣ"), "ABC");
  assert.equal(normalizeAccountDisplayName(" "), null);
  assert.equal(normalizeAccountDisplayName("가".repeat(120))?.length, 100);
});

test("성과 이름을 한국식 순서로 조합한다", async () => {
  const { formatKoreanOrderedName } = await import(
    "../src/shared/auth/displayName"
  );

  assert.equal(formatKoreanOrderedName("연한", "정"), "정연한");
  assert.equal(formatKoreanOrderedName("Tuti", "Tester"), "Tester Tuti");
  assert.equal(formatKoreanOrderedName(null, null, "튜티 사용자"), "튜티 사용자");
});

test("Apple 최초 로그인 응답에서 이름을 안전하게 읽는다", async () => {
  const { parseAppleDisplayName } = await import(
    "../src/server/auth/oauth"
  );

  assert.equal(
    parseAppleDisplayName(JSON.stringify({
      name: { firstName: "Tuti", lastName: "Tester" },
      email: "ignored@example.com",
    })),
    "Tester Tuti",
  );
  assert.equal(parseAppleDisplayName("not-json"), null);
  assert.equal(parseAppleDisplayName(null), null);
});

test("최초 로그인에서만 OAuth 이름 권한을 요청한다", async () => {
  const { getOAuthScopes } = await import("../src/server/auth/oauth");

  assert.deepEqual(getOAuthScopes("google", true), [
    "openid",
    "email",
    "profile",
  ]);
  assert.deepEqual(getOAuthScopes("google", false), ["openid", "email"]);
  assert.deepEqual(getOAuthScopes("apple", true), ["email", "name"]);
  assert.deepEqual(getOAuthScopes("apple", false), ["email"]);
  assert.deepEqual(getOAuthScopes("kakao", true), [
    "account_email",
    "profile_nickname",
  ]);
  assert.deepEqual(getOAuthScopes("kakao", false), ["account_email"]);
});

test("계정 응답에 연결된 로그인 수단을 개별 항목으로 제공한다", async () => {
  const { createAccountProfile } = await import("../src/server/auth/session");
  const account = createAccountProfile(
    "튜티 사용자",
    [
      { id: "email-identity", provider: "email", email: "me@example.com" },
      { id: "google-identity", provider: "google", email: "me@example.com" },
      { id: "apple-identity", provider: "apple", email: null },
    ],
    "user",
  );

  assert.deepEqual(account, {
    displayName: "튜티 사용자",
    email: "me@example.com",
    identities: [
      { id: "email-identity", provider: "email", email: "me@example.com" },
      { id: "google-identity", provider: "google", email: "me@example.com" },
      { id: "apple-identity", provider: "apple" },
    ],
    providers: ["email", "google", "apple"],
    role: "user",
  });
});

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
