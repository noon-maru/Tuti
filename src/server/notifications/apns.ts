import {
  connect,
  constants as http2Constants,
  type ClientHttp2Session,
} from "node:http2";
import { createPrivateKey, sign } from "node:crypto";
import { readFile } from "node:fs/promises";
import { prisma } from "@/server/db/prisma";
import { isPushEnabledForUser } from "@/server/notifications/pushAccess";
import {
  createIosApnsPayload,
  type ServerPushMessage,
} from "@/server/notifications/pushPayload";

const APNS_PRODUCTION_ORIGIN = "https://api.push.apple.com";
const APNS_SANDBOX_ORIGIN = "https://api.sandbox.push.apple.com";
const APNS_REQUEST_TIMEOUT_MS = 15_000;
const APNS_TOKEN_MAX_AGE_MS = 50 * 60 * 1_000;

type ApnsCredentials = {
  bundleId: string;
  keyId: string;
  privateKey: string;
  teamId: string;
};

type CachedProviderToken = {
  credentialsKey: string;
  expiresAt: number;
  value: string;
};

let credentialsPromise: Promise<ApnsCredentials> | null = null;
let cachedProviderToken: CachedProviderToken | null = null;

export async function sendIosPushToUser(
  userId: string,
  message: ServerPushMessage,
) {
  if (!(await isPushEnabledForUser(userId, "ios"))) {
    return { attempted: 0, sent: 0, invalidated: 0 };
  }

  const devices = await prisma.pushDevice.findMany({
    where: {
      userId,
      platform: "ios",
      enabled: true,
      invalidatedAt: null,
    },
    select: { id: true, token: true },
  });

  let sent = 0;
  let invalidated = 0;

  for (const device of devices) {
    const result = await sendApnsMessage(device.token, message);
    if (result === "sent") {
      sent += 1;
      continue;
    }
    if (result === "invalid") {
      invalidated += 1;
      await prisma.pushDevice.updateMany({
        where: { id: device.id, token: device.token },
        data: { enabled: false, invalidatedAt: new Date() },
      });
    }
  }

  return { attempted: devices.length, sent, invalidated };
}

export function createApnsProviderToken(input: {
  keyId: string;
  privateKey: string;
  teamId: string;
  now?: number;
}) {
  const issuedAt = Math.floor((input.now ?? Date.now()) / 1_000);
  const header = encodeJwtPart({ alg: "ES256", kid: input.keyId });
  const claims = encodeJwtPart({ iss: input.teamId, iat: issuedAt });
  const signingInput = `${header}.${claims}`;
  const privateKey = createPrivateKey(
    input.privateKey.replace(/\\n/g, "\n"),
  );
  const signature = sign("sha256", Buffer.from(signingInput), {
    key: privateKey,
    dsaEncoding: "ieee-p1363",
  });
  return `${signingInput}.${signature.toString("base64url")}`;
}

export function isInvalidApnsTokenResponse(status: number, reason: string) {
  return (
    status === 410 ||
    (status === 400 &&
      ["BadDeviceToken", "DeviceTokenNotForTopic", "Unregistered"].includes(
        reason,
      ))
  );
}

async function sendApnsMessage(
  deviceToken: string,
  message: ServerPushMessage,
): Promise<"sent" | "invalid"> {
  const credentials = await getApnsCredentials();
  const providerToken = getProviderToken(credentials);
  const response = await performApnsRequest(
    getApnsOrigin(),
    deviceToken,
    credentials.bundleId,
    providerToken,
    JSON.stringify(createIosApnsPayload(message)),
  );

  if (response.status === 200) return "sent";

  const reason = readApnsReason(response.body);
  if (isInvalidApnsTokenResponse(response.status, reason)) return "invalid";
  throw new Error(
    `APNs가 HTTP ${response.status}${reason ? ` (${reason})` : ""} 응답을 반환했습니다.`,
  );
}

async function getApnsCredentials() {
  credentialsPromise ??= loadApnsCredentials();
  return credentialsPromise;
}

async function loadApnsCredentials(): Promise<ApnsCredentials> {
  const privateKeyPath = requireEnv("APNS_PRIVATE_KEY_PATH");
  return {
    bundleId: process.env.APNS_BUNDLE_ID?.trim() || "com.noonmaru.tuti",
    keyId: requireEnv("APNS_KEY_ID"),
    privateKey: await readFile(privateKeyPath, "utf8"),
    teamId: requireEnv("APNS_TEAM_ID"),
  };
}

function getProviderToken(credentials: ApnsCredentials) {
  const credentialsKey = `${credentials.teamId}:${credentials.keyId}`;
  if (
    cachedProviderToken &&
    cachedProviderToken.credentialsKey === credentialsKey &&
    cachedProviderToken.expiresAt > Date.now()
  ) {
    return cachedProviderToken.value;
  }

  const value = createApnsProviderToken(credentials);
  cachedProviderToken = {
    credentialsKey,
    expiresAt: Date.now() + APNS_TOKEN_MAX_AGE_MS,
    value,
  };
  return value;
}

function getApnsOrigin() {
  const environment = process.env.APNS_ENVIRONMENT?.trim().toLowerCase();
  return environment === "sandbox" || environment === "development"
    ? APNS_SANDBOX_ORIGIN
    : APNS_PRODUCTION_ORIGIN;
}

function performApnsRequest(
  origin: string,
  deviceToken: string,
  bundleId: string,
  providerToken: string,
  payload: string,
) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    let settled = false;
    let session: ClientHttp2Session | null = connect(origin);
    const finish = (
      result: { status: number; body: string } | null,
      error?: Error,
    ) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      session?.close();
      session = null;
      if (error) reject(error);
      else if (result) resolve(result);
    };
    const request = session.request({
      ":method": "POST",
      ":path": `/3/device/${encodeURIComponent(deviceToken)}`,
      authorization: `bearer ${providerToken}`,
      "apns-topic": bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    });
    let status = 0;
    let body = "";
    const timeoutId = setTimeout(() => {
      request.close(http2Constants.NGHTTP2_CANCEL);
      finish(null, new Error("APNs 요청 시간이 초과되었습니다."));
    }, APNS_REQUEST_TIMEOUT_MS);

    session.on("error", (error) => finish(null, error));
    request.setEncoding("utf8");
    request.on("response", (headers) => {
      status = Number(headers[":status"] ?? 0);
    });
    request.on("data", (chunk: string) => {
      body += chunk;
    });
    request.on("end", () => finish({ status, body }));
    request.on("error", (error) => finish(null, error));
    request.end(payload);
  });
}

function readApnsReason(body: string) {
  try {
    const parsed = JSON.parse(body) as { reason?: unknown };
    return typeof parsed.reason === "string" ? parsed.reason : "";
  } catch {
    return "";
  }
}

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name}가 설정되지 않았습니다.`);
  return value;
}

function encodeJwtPart(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}
