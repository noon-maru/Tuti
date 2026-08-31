import { createSign } from "node:crypto";
import { readFile } from "node:fs/promises";
import { prisma } from "@/server/db/prisma";
import { isInvalidRegistrationError } from "@/server/notifications/fcmErrors";
import { createSafePushData } from "@/server/notifications/pushPayload";

const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token";

type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
};

type CachedAccessToken = {
  value: string;
  expiresAt: number;
};

export type ServerPushMessage = {
  title: string;
  body: string;
  path: string;
  type: string;
  entityId?: string;
};

let serviceAccountPromise: Promise<ServiceAccount> | null = null;
let cachedAccessToken: CachedAccessToken | null = null;

export function isFcmPushEnabled() {
  return process.env.FCM_PUSH_ENABLED?.trim().toLowerCase() === "true";
}

export async function sendPushToUserSafely(
  userId: string | null,
  message: ServerPushMessage,
) {
  if (!userId || !isFcmPushEnabled()) return;

  try {
    await sendPushToUser(userId, message);
  } catch (error) {
    console.error("사용자 푸시 알림을 보내지 못했습니다.", {
      error: error instanceof Error ? error.message : "UnknownError",
      userId,
      type: message.type,
      entityId: message.entityId,
    });
  }
}

export async function sendPushToUser(
  userId: string,
  message: ServerPushMessage,
) {
  if (!isFcmPushEnabled()) return { attempted: 0, sent: 0, invalidated: 0 };

  const devices = await prisma.pushDevice.findMany({
    where: {
      userId,
      platform: "android",
      enabled: true,
      invalidatedAt: null,
    },
    select: { id: true, token: true },
  });

  let sent = 0;
  let invalidated = 0;

  for (const device of devices) {
    const result = await sendFcmMessage(device.token, message);
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

async function sendFcmMessage(
  token: string,
  message: ServerPushMessage,
): Promise<"sent" | "invalid"> {
  const [serviceAccount, accessToken] = await Promise.all([
    getServiceAccount(),
    getAccessToken(),
  ]);
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(serviceAccount.project_id)}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token,
          notification: {
            title: message.title,
            body: message.body,
          },
          data: createSafePushData(message),
          android: {
            priority: "normal",
            notification: {
              channelId: "tuti_service_updates",
              icon: "tuti_notification_icon",
              color: "#8CBDEF",
              defaultSound: true,
            },
          },
        },
      }),
    },
  );

  if (response.ok) return "sent";

  const errorBody = await response.text();
  if (isInvalidRegistrationError(response.status, errorBody)) return "invalid";

  throw new Error(`FCM이 HTTP ${response.status} 응답을 반환했습니다.`);
}

async function getServiceAccount() {
  serviceAccountPromise ??= loadServiceAccount();
  return serviceAccountPromise;
}

async function loadServiceAccount() {
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (!path) {
    throw new Error("GOOGLE_APPLICATION_CREDENTIALS가 설정되지 않았습니다.");
  }

  const parsed = JSON.parse(await readFile(path, "utf8")) as Partial<ServiceAccount>;
  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error("Firebase 서비스 계정 파일을 확인해주세요.");
  }

  return parsed as ServiceAccount;
}

async function getAccessToken() {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.value;
  }

  const serviceAccount = await getServiceAccount();
  const tokenUri = serviceAccount.token_uri || DEFAULT_TOKEN_URI;
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = encodeJson({ alg: "RS256", typ: "JWT" });
  const claims = encodeJson({
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: tokenUri,
    scope: FCM_SCOPE,
    iat: issuedAt,
    exp: issuedAt + 3600,
  });
  const unsignedToken = `${header}.${claims}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsignedToken);
  signer.end();
  const assertion = `${unsignedToken}.${signer.sign(serviceAccount.private_key, "base64url")}`;
  const response = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!response.ok) {
    throw new Error(`Google OAuth가 HTTP ${response.status} 응답을 반환했습니다.`);
  }

  const body = (await response.json()) as {
    access_token?: unknown;
    expires_in?: unknown;
  };
  if (typeof body.access_token !== "string") {
    throw new Error("Google OAuth 액세스 토큰 응답을 확인해주세요.");
  }

  const expiresIn =
    typeof body.expires_in === "number" && body.expires_in > 0
      ? body.expires_in
      : 3600;
  cachedAccessToken = {
    value: body.access_token,
    expiresAt: Date.now() + expiresIn * 1000,
  };
  return cachedAccessToken.value;
}

function encodeJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}
