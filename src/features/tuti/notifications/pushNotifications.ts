import { App } from "@capacitor/app";
import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import {
  PushNotifications,
  type Token,
} from "@capacitor/push-notifications";
import { ensureSession, fetchWithPinnedSession, getSessionSnapshot } from "@/lib/auth/session";
import { preferencesStorage } from "@/lib/storage/preferencesStorage";
import { createPushPrivacyLifecycle, type PushPrivacyState } from "@/lib/notifications/pushPrivacyLifecycle";
import type {
  PushPlatform,
  PushDeviceResponse,
  RegisterPushDeviceRequest,
} from "@/shared/api/push";
import { TUTI_SERVICE_PUSH_CHANNEL_ID } from "@/shared/notifications/pushChannel";

const INSTALLATION_ID_KEY = "tuti-push-installation-id";
const REGISTRATION_TIMEOUT_MS = 15_000;
const LEGACY_TUTI_SERVICE_PUSH_CHANNEL_ID = "tuti_service_updates";
const PRIVACY_STATE_KEY = "tuti-push-privacy-v1";
const TutiPushPrivacy = registerPlugin<{
  registerToken(): Promise<Token>;
  revoke(): Promise<void>;
}>("TutiPushPrivacy");

const privacy = createPushPrivacyLifecycle({
  async read() {
    const raw = await preferencesStorage.getItem(PRIVACY_STATE_KEY);
    if (!raw) return { status: "disabled", ownerId: null, serverCleanupRequired: false };
    const value = JSON.parse(raw) as PushPrivacyState;
    if (!["enabled", "disabled", "cleanup-pending"].includes(value.status) ||
        typeof value.serverCleanupRequired !== "boolean" ||
        (value.ownerId !== null && typeof value.ownerId !== "string")) {
      throw new Error("알림 정리 상태를 확인하지 못했어요.");
    }
    return value;
  },
  async write(state) {
    if (state.status === "disabled") await Preferences.remove({ key: INSTALLATION_ID_KEY });
    await preferencesStorage.setItem(PRIVACY_STATE_KEY, JSON.stringify(state));
  },
  deleteServer: deleteServerRegistration,
  revokeNative: revokeNativePush,
});

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
  const owner = await ensureSession();
  const registered = await privacy.enable(owner.userId, async (assertActive) => {
    let { receive } = await PushNotifications.checkPermissions();
    if (receive === "prompt" || receive === "prompt-with-rationale") {
      ({ receive } = await PushNotifications.requestPermissions());
    }
    assertActive();
    assertSessionOwner(owner.userId);
    if (receive !== "granted") return false;
    return registerForOwner(owner.userId, assertActive);
  });
  return { status: registered ? "registered" : "denied" } as const;
}

export async function syncServerPushRegistration() {
  if (!supportsServerPushNotifications()) return false;
  const owner = getSessionSnapshot();
  if (!owner) return null;
  return privacy.sync(owner.userId, async (assertActive) => {
    const { receive } = await PushNotifications.checkPermissions();
    assertActive();
    if (receive !== "granted") return false;
    return registerForOwner(owner.userId, assertActive);
  });
}

export async function disableServerPushNotifications() {
  if (!supportsServerPushNotifications()) return;
  const owner = getSessionSnapshot();
  await privacy.revoke(owner?.userId ?? null);
}

async function deleteServerRegistration(ownerId: string | null) {
  const { value: installationId } = await Preferences.get({ key: INSTALLATION_ID_KEY });
  if (!installationId) return;
  if (!ownerId) throw new Error("알림 등록을 정리하려면 계정 확인이 필요해요.");
  assertSessionOwner(ownerId);
  const response = await fetchWithPinnedSession("push/devices", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ installationId }),
  }, ownerId);
  if (!response.ok) {
    throw new Error("서버 알림 등록을 해제하지 못했습니다.");
  }
}

function assertSessionOwner(ownerId: string) {
  if (getSessionSnapshot()?.userId !== ownerId) throw new Error("계정이 변경되어 알림 등록을 중단했어요.");
}

async function registerForOwner(ownerId: string, assertActive: () => void) {
  assertActive();
  assertSessionOwner(ownerId);
  await configurePushChannel();
  assertActive();
  const token = await requestPushToken();
  assertActive();
  assertSessionOwner(ownerId);
  await registerPushDevice(token.value, ownerId, assertActive);
  assertActive();
  assertSessionOwner(ownerId);
  return true;
}

async function revokeNativePush() {
  if (Capacitor.getPlatform() === "android") {
    if (!Capacitor.isPluginAvailable("TutiPushPrivacy")) {
      // 구버전은 FID 삭제를 증명할 수 없으므로 정리 완료로 표시하지 않는다.
      await PushNotifications.unregister();
      throw new Error("기기 알림 정리를 마치려면 앱 업데이트가 필요해요.");
    }
    await withNativeTimeout(TutiPushPrivacy.revoke());
  } else {
    await withNativeTimeout(PushNotifications.unregister());
  }
}

function withNativeTimeout<T>(operation: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("기기 알림 정리가 아직 끝나지 않았어요. 연결 후 다시 시도해주세요.")), 30_000);
    operation.then(resolve, reject).finally(() => clearTimeout(timeout));
  });
}

export async function recoverServerPushPrivacy() {
  if (!supportsServerPushNotifications()) return false;
  const state = await preferencesStorage.getItem(PRIVACY_STATE_KEY);
  const installation = await Preferences.get({ key: INSTALLATION_ID_KEY });
  if (!state && installation.value) {
    // 기존 설치의 토큰은 새 초기 수집/파기 경계로 정리한 뒤 명시적으로 다시 켠다.
    const owner = getSessionSnapshot();
    if (!owner) return null; // 세션 복구를 기다린다. 소유자 없는 정리 기록을 만들지 않는다.
    await privacy.revoke(owner.userId);
    return false;
  }
  return privacy.recover();
}

export async function preparePushForAccountDeletion(ownerId: string) {
  if (supportsServerPushNotifications()) await privacy.prepareAccountDeletion(ownerId);
}

export async function finishPushAfterAccountDeletion() {
  if (!supportsServerPushNotifications()) return true;
  try { await withNativeTimeout(privacy.finishAccountDeletion()); return true; }
  catch { return false; } // 영구 pending 기록을 남겨 다음 실행 시 재시도한다.
}

export async function registerPushDevice(token: string, ownerId: string, assertActive: () => void) {
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
  assertActive();
  assertSessionOwner(ownerId);
  const response = await fetchWithPinnedSession("push/devices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }, ownerId);

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
  if (Capacitor.getPlatform() === "android") {
    if (!Capacitor.isPluginAvailable("TutiPushPrivacy")) {
      throw new Error("안전한 알림 등록을 위해 앱을 업데이트해주세요.");
    }
    return withNativeTimeout(TutiPushPrivacy.registerToken());
  }
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
