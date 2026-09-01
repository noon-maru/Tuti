import { App } from "@capacitor/app";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import {
  PushNotifications,
  type Token,
} from "@capacitor/push-notifications";
import { fetchWithSession } from "@/lib/auth/session";
import type {
  PushPlatform,
  PushDeviceResponse,
  RegisterPushDeviceRequest,
} from "@/shared/api/push";
import { TUTI_SERVICE_PUSH_CHANNEL_ID } from "@/shared/notifications/pushChannel";

const INSTALLATION_ID_KEY = "tuti-push-installation-id";
const REGISTRATION_TIMEOUT_MS = 15_000;
const LEGACY_TUTI_SERVICE_PUSH_CHANNEL_ID = "tuti_service_updates";

export type PushNotificationStatus = {
  supported: boolean;
  permission: "prompt" | "prompt-with-rationale" | "granted" | "denied" | "unsupported";
};

export function supportsServerPushNotifications() {
  const platform = Capacitor.getPlatform();
  return platform === "android" || platform === "ios";
}

export async function getPushNotificationStatus(): Promise<PushNotificationStatus> {
  if (!supportsServerPushNotifications()) {
    return { supported: false, permission: "unsupported" };
  }

  const { receive } = await PushNotifications.checkPermissions();
  return { supported: true, permission: receive };
}

export async function enableServerPushNotifications() {
  if (!supportsServerPushNotifications()) return { status: "unsupported" } as const;

  let { receive } = await PushNotifications.checkPermissions();
  if (receive === "prompt" || receive === "prompt-with-rationale") {
    ({ receive } = await PushNotifications.requestPermissions());
  }
  if (receive !== "granted") return { status: "denied" } as const;

  await configurePushChannel();
  const token = await requestPushToken();
  await registerPushDevice(token.value);
  return { status: "registered" } as const;
}

export async function syncServerPushRegistration() {
  if (!supportsServerPushNotifications()) return;
  const { receive } = await PushNotifications.checkPermissions();
  if (receive !== "granted") return;

  await configurePushChannel();
  const token = await requestPushToken();
  await registerPushDevice(token.value);
}

export async function disableServerPushNotifications() {
  if (!supportsServerPushNotifications()) return;

  const installationId = await getInstallationId();
  const response = await fetchWithSession("push/devices", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ installationId }),
  });
  if (!response.ok && response.status !== 404) {
    throw new Error("서버 알림 등록을 해제하지 못했습니다.");
  }

  await PushNotifications.unregister();
}

export async function registerPushDevice(token: string) {
  const [installationId, appInfo] = await Promise.all([
    getInstallationId(),
    App.getInfo(),
  ]);
  const input: RegisterPushDeviceRequest = {
    installationId,
    platform: getPushPlatform(),
    token,
    appVersion: `${appInfo.version} (${appInfo.build})`,
    locale: navigator.language,
  };
  const response = await fetchWithSession("push/devices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(
      await readPushApiError(
        response,
        "서버 알림 기기를 등록하지 못했습니다.",
      ),
    );
  }

  const data = (await response.json()) as PushDeviceResponse;
  if (data.registered !== true) {
    throw new Error("서버 알림 등록 응답을 확인하지 못했습니다.");
  }
}

async function readPushApiError(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { error?: unknown };
    return typeof body.error === "string" ? body.error : fallback;
  } catch {
    return fallback;
  }
}

async function configurePushChannel() {
  if (Capacitor.getPlatform() !== "android") return;

  await PushNotifications.createChannel({
    id: TUTI_SERVICE_PUSH_CHANNEL_ID,
    name: "Tuti 소식",
    description: "문의 답변처럼 사용자가 기다리는 소식을 알려드려요.",
    importance: 4,
    visibility: 1,
    vibration: true,
    lights: true,
    lightColor: "#C7EA86",
  });
  await PushNotifications.deleteChannel({
    id: LEGACY_TUTI_SERVICE_PUSH_CHANNEL_ID,
  }).catch(() => undefined);
}

function getPushPlatform(): PushPlatform {
  return Capacitor.getPlatform() === "ios" ? "ios" : "android";
}

async function requestPushToken() {
  const listeners: PluginListenerHandle[] = [];
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let finished = false;

  try {
    return await new Promise<Token>((resolve, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error("푸시 토큰 발급 시간이 초과되었습니다.")),
        REGISTRATION_TIMEOUT_MS,
      );
      void PushNotifications.addListener("registration", resolve).then(
        (listener) => {
          if (finished) void listener.remove();
          else listeners.push(listener);
        },
        reject,
      );
      void PushNotifications.addListener("registrationError", ({ error }) => {
        reject(new Error(error));
      }).then((listener) => {
        if (finished) void listener.remove();
        else listeners.push(listener);
      }, reject);
      void PushNotifications.register().catch(reject);
    });
  } finally {
    finished = true;
    if (timeoutId) clearTimeout(timeoutId);
    await Promise.all(listeners.map((listener) => listener.remove()));
  }
}

async function getInstallationId() {
  const stored = await Preferences.get({ key: INSTALLATION_ID_KEY });
  if (stored.value) return stored.value;

  const installationId = crypto.randomUUID().replaceAll("-", "");
  await Preferences.set({ key: INSTALLATION_ID_KEY, value: installationId });
  return installationId;
}
