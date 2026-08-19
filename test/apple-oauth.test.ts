import assert from "node:assert/strict";
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
} from "node:crypto";
import test from "node:test";
import {
  createAppleClientSecret,
  decryptAppleRefreshToken,
  encryptAppleRefreshToken,
  resetAppleJwksCacheForTest,
  revokeAppleRefreshToken,
  verifyAppleIdentityToken,
} from "../src/server/auth/appleOAuth";

const NOW = Date.UTC(2026, 7, 19, 3, 0, 0);
const TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

test("Apple refresh token을 인증 암호화하고 복호화한다", () => {
  const encrypted = encryptAppleRefreshToken(
    "sensitive-refresh-token",
    TOKEN_ENCRYPTION_KEY,
  );

  assert.match(encrypted, /^v1\.[^.]+\.[^.]+\.[^.]+$/);
  assert.equal(encrypted.includes("sensitive-refresh-token"), false);
  assert.equal(
    decryptAppleRefreshToken(encrypted, TOKEN_ENCRYPTION_KEY),
    "sensitive-refresh-token",
  );
  assert.throws(
    () =>
      decryptAppleRefreshToken(
        encrypted,
        Buffer.alloc(32, 8).toString("base64"),
      ),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "invalid_apple_refresh_token",
  );
});

test("Apple 계정 삭제 시 복호화한 refresh token을 폐기한다", async () => {
  const { privateKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
  const encrypted = encryptAppleRefreshToken(
    "refresh-token-to-revoke",
    TOKEN_ENCRYPTION_KEY,
  );
  let requestBody: URLSearchParams | undefined;

  await revokeAppleRefreshToken(encrypted, {
    clientId: "com.noonmaru.tuti.apple.web",
    teamId: "APPLE_TEAM",
    keyId: "APPLE_KEY",
    privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    encryptionKey: TOKEN_ENCRYPTION_KEY,
    fetch: (async (_url, init) => {
      requestBody = init?.body as URLSearchParams;
      return new Response(null, { status: 200 });
    }) as typeof fetch,
  });

  assert.equal(requestBody?.get("client_id"), "com.noonmaru.tuti.apple.web");
  assert.equal(requestBody?.get("token"), "refresh-token-to-revoke");
  assert.equal(requestBody?.get("token_type_hint"), "refresh_token");
  assert.ok(requestBody?.get("client_secret"));
});

test("Apple client secret을 ES256 JWT로 생성한다", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
  const token = createAppleClientSecret({
    clientId: "com.noonmaru.tuti.apple.web",
    keyId: "APPLE_KEY",
    privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    teamId: "APPLE_TEAM",
    now: NOW,
  });
  const [encodedHeader, encodedClaims, encodedSignature] = token.split(".");
  const header = decodeJwtPart(encodedHeader);
  const claims = decodeJwtPart(encodedClaims);

  assert.deepEqual(header, { alg: "ES256", kid: "APPLE_KEY", typ: "JWT" });
  assert.equal(claims.iss, "APPLE_TEAM");
  assert.equal(claims.sub, "com.noonmaru.tuti.apple.web");
  assert.equal(claims.aud, "https://appleid.apple.com");
  assert.equal(Number(claims.exp) - Number(claims.iat), 300);
  assert.equal(
    verify(
      "sha256",
      Buffer.from(`${encodedHeader}.${encodedClaims}`),
      { key: publicKey, dsaEncoding: "ieee-p1363" },
      Buffer.from(encodedSignature, "base64url"),
    ),
    true,
  );
});

test("Apple ID token의 서명과 필수 클레임을 검증한다", async () => {
  resetAppleJwksCacheForTest();
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const identityToken = createIdentityToken(privateKey, {
    iss: "https://appleid.apple.com",
    aud: "com.noonmaru.tuti.apple.web",
    exp: NOW / 1_000 + 300,
    iat: NOW / 1_000,
    sub: "apple-user-123",
    nonce: "expected-nonce",
    email: "USER@PRIVATERELAY.APPLEID.COM",
    email_verified: "true",
  });
  const profile = await verifyAppleIdentityToken(identityToken, {
    clientId: "com.noonmaru.tuti.apple.web",
    nonce: "expected-nonce",
    now: NOW,
    fetch: createJwksFetch(publicKey),
  });

  assert.deepEqual(profile, {
    subject: "apple-user-123",
    email: "user@privaterelay.appleid.com",
  });
});

test("nonce가 다른 Apple ID token을 거부한다", async () => {
  resetAppleJwksCacheForTest();
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const identityToken = createIdentityToken(privateKey, {
    iss: "https://appleid.apple.com",
    aud: "com.noonmaru.tuti.apple.web",
    exp: NOW / 1_000 + 300,
    iat: NOW / 1_000,
    sub: "apple-user-123",
    nonce: "different-nonce",
  });

  await assert.rejects(
    verifyAppleIdentityToken(identityToken, {
      clientId: "com.noonmaru.tuti.apple.web",
      nonce: "expected-nonce",
      now: NOW,
      fetch: createJwksFetch(publicKey),
    }),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "invalid_apple_identity_token",
  );
});

function createIdentityToken(
  privateKey: ReturnType<typeof createPrivateKey>,
  claims: object,
) {
  const encodedHeader = encodeJwtPart({
    alg: "RS256",
    kid: "APPLE_SIGNING_KEY",
    typ: "JWT",
  });
  const encodedClaims = encodeJwtPart(claims);
  const signingInput = `${encodedHeader}.${encodedClaims}`;
  const signature = sign("sha256", Buffer.from(signingInput), privateKey);
  return `${signingInput}.${signature.toString("base64url")}`;
}

function createJwksFetch(publicKey: ReturnType<typeof createPublicKey>) {
  const jwk = publicKey.export({ format: "jwk" });
  return (async () =>
    Response.json({
      keys: [
        {
          ...jwk,
          kid: "APPLE_SIGNING_KEY",
          alg: "RS256",
          use: "sig",
        },
      ],
    })) as typeof fetch;
}

function encodeJwtPart(value: object) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decodeJwtPart(value: string) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<
    string,
    string | number
  >;
}
