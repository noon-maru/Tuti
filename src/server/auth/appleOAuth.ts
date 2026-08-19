import {
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  randomBytes,
  sign,
  verify,
  type JsonWebKey,
} from "node:crypto";

const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_JWKS_URL = `${APPLE_ISSUER}/auth/keys`;
const APPLE_CLIENT_SECRET_AUDIENCE = "https://appleid.apple.com";
const CLOCK_TOLERANCE_SECONDS = 60;
const REFRESH_TOKEN_AAD = Buffer.from("tuti:apple-refresh-token:v1");

type AppleIdentityClaims = {
  iss?: unknown;
  aud?: unknown;
  exp?: unknown;
  iat?: unknown;
  sub?: unknown;
  nonce?: unknown;
  email?: unknown;
  email_verified?: unknown;
};

type AppleJwk = JsonWebKey & {
  kid?: string;
  alg?: string;
  use?: string;
};

export class AppleOAuthError extends Error {
  constructor(public readonly code: string) {
    super("Apple OAuth verification failed");
    this.name = "AppleOAuthError";
  }
}

export function encryptAppleRefreshToken(
  refreshToken: string,
  encodedKey: string,
) {
  const key = decodeRefreshTokenKey(encodedKey);
  const initializationVector = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, initializationVector);
  cipher.setAAD(REFRESH_TOKEN_AAD);
  const ciphertext = Buffer.concat([
    cipher.update(refreshToken, "utf8"),
    cipher.final(),
  ]);
  const authenticationTag = cipher.getAuthTag();

  return [
    "v1",
    initializationVector.toString("base64url"),
    authenticationTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptAppleRefreshToken(
  encryptedToken: string,
  encodedKey: string,
) {
  const [version, encodedIv, encodedTag, encodedCiphertext, extra] =
    encryptedToken.split(".");
  if (
    version !== "v1" ||
    !encodedIv ||
    !encodedTag ||
    !encodedCiphertext ||
    extra !== undefined
  ) {
    throw new AppleOAuthError("invalid_apple_refresh_token");
  }

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      decodeRefreshTokenKey(encodedKey),
      Buffer.from(encodedIv, "base64url"),
    );
    decipher.setAAD(REFRESH_TOKEN_AAD);
    decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encodedCiphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch (error) {
    if (error instanceof AppleOAuthError) throw error;
    throw new AppleOAuthError("invalid_apple_refresh_token");
  }
}

export async function revokeAppleRefreshToken(
  encryptedToken: string,
  input: {
    clientId: string;
    encryptionKey: string;
    keyId: string;
    privateKey: string;
    teamId: string;
    fetch?: typeof fetch;
  },
) {
  const refreshToken = decryptAppleRefreshToken(
    encryptedToken,
    input.encryptionKey,
  );
  const clientSecret = createAppleClientSecret(input);
  const response = await (input.fetch ?? fetch)(
    "https://appleid.apple.com/auth/revoke",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: input.clientId,
        client_secret: clientSecret,
        token: refreshToken,
        token_type_hint: "refresh_token",
      }),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new AppleOAuthError("apple_token_revocation_failed");
  }
}

let cachedAppleKeys:
  | { expiresAt: number; keys: AppleJwk[] }
  | undefined;

export function createAppleClientSecret(input: {
  clientId: string;
  keyId: string;
  privateKey: string;
  teamId: string;
  now?: number;
}) {
  const issuedAt = Math.floor((input.now ?? Date.now()) / 1_000);
  const header = encodeJwtPart({ alg: "ES256", kid: input.keyId, typ: "JWT" });
  const payload = encodeJwtPart({
    iss: input.teamId,
    iat: issuedAt,
    exp: issuedAt + 5 * 60,
    aud: APPLE_CLIENT_SECRET_AUDIENCE,
    sub: input.clientId,
  });
  const signingInput = `${header}.${payload}`;
  const privateKey = createPrivateKey(
    input.privateKey.replace(/\\n/g, "\n"),
  );
  const signature = sign("sha256", Buffer.from(signingInput), {
    key: privateKey,
    dsaEncoding: "ieee-p1363",
  });

  return `${signingInput}.${signature.toString("base64url")}`;
}

export async function verifyAppleIdentityToken(
  identityToken: string,
  input: {
    clientId: string;
    nonce: string;
    now?: number;
    fetch?: typeof fetch;
  },
) {
  const parts = identityToken.split(".");
  if (parts.length !== 3) throw invalidAppleIdentityToken();

  const header = decodeJwtPart(parts[0]) as {
    alg?: unknown;
    kid?: unknown;
  };
  const claims = decodeJwtPart(parts[1]) as AppleIdentityClaims;
  const keyId = typeof header.kid === "string" ? header.kid : "";

  if (header.alg !== "RS256" || !keyId) throw invalidAppleIdentityToken();

  const keys = await getAppleKeys(input.fetch ?? fetch, input.now);
  const jwk = keys.find(
    (candidate) =>
      candidate.kid === keyId &&
      (!candidate.alg || candidate.alg === "RS256") &&
      (!candidate.use || candidate.use === "sig"),
  );
  if (!jwk) throw invalidAppleIdentityToken();

  let signatureValid = false;
  try {
    signatureValid = verify(
      "sha256",
      Buffer.from(`${parts[0]}.${parts[1]}`),
      createPublicKey({ key: jwk, format: "jwk" }),
      Buffer.from(parts[2], "base64url"),
    );
  } catch {
    throw invalidAppleIdentityToken();
  }
  if (!signatureValid) throw invalidAppleIdentityToken();

  const now = Math.floor((input.now ?? Date.now()) / 1_000);
  const audienceMatches =
    claims.aud === input.clientId ||
    (Array.isArray(claims.aud) && claims.aud.includes(input.clientId));
  if (
    claims.iss !== APPLE_ISSUER ||
    !audienceMatches ||
    typeof claims.exp !== "number" ||
    claims.exp <= now - CLOCK_TOLERANCE_SECONDS ||
    typeof claims.iat !== "number" ||
    claims.iat > now + CLOCK_TOLERANCE_SECONDS ||
    typeof claims.sub !== "string" ||
    !claims.sub ||
    claims.nonce !== input.nonce
  ) {
    throw invalidAppleIdentityToken();
  }

  const emailVerified =
    claims.email_verified === true || claims.email_verified === "true";

  return {
    subject: claims.sub,
    email:
      emailVerified && typeof claims.email === "string"
        ? claims.email.trim().toLowerCase()
        : null,
  };
}

async function getAppleKeys(fetchImpl: typeof fetch, now = Date.now()) {
  if (cachedAppleKeys && cachedAppleKeys.expiresAt > now) {
    return cachedAppleKeys.keys;
  }

  const response = await fetchImpl(APPLE_JWKS_URL, { cache: "no-store" });
  const body = (await response.json().catch(() => null)) as {
    keys?: unknown;
  } | null;
  if (!response.ok || !Array.isArray(body?.keys)) {
    throw new AppleOAuthError("apple_jwks_failed");
  }

  const keys = body.keys.filter(
    (key): key is AppleJwk =>
      typeof key === "object" && key !== null,
  );
  cachedAppleKeys = { keys, expiresAt: now + 60 * 60_000 };
  return keys;
}

function encodeJwtPart(value: object) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decodeJwtPart(value: string) {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
  } catch {
    throw invalidAppleIdentityToken();
  }
}

function invalidAppleIdentityToken() {
  return new AppleOAuthError("invalid_apple_identity_token");
}

export function resetAppleJwksCacheForTest() {
  cachedAppleKeys = undefined;
}

function decodeRefreshTokenKey(encodedKey: string) {
  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32) {
    throw new AppleOAuthError("invalid_apple_token_encryption_key");
  }
  return key;
}
