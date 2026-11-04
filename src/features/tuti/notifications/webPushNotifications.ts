import { Capacitor } from "@capacitor/core";
import { getSessionSnapshot, fetchWithPinnedSession } from "@/lib/auth/session";
import { preferencesStorage } from "@/lib/storage/preferencesStorage";
import { createPushPrivacyLifecycle, type PushPrivacyState } from "@/lib/notifications/pushPrivacyLifecycle";
import { parseWebPushSubscription } from "@/shared/notifications/webPush";
import type { PushNotificationStatus } from "./pushNotifications";

const STATE = "tuti-web-push-privacy-v1";
const SUBSCRIPTION = "tuti-web-push-subscription-v1";
const SW = "/tuti-push-sw.js";
const CACHE = "tuti-push-state-v1";
const OWNER = "/__tuti_push_owner";
export type WebPushAvailability = "supported" | "install-required" | "insecure" | "unsupported";

export function webPushAvailability(): WebPushAvailability {
  if (typeof window === "undefined" || Capacitor.isNativePlatform()) return "unsupported";
  if (!window.isSecureContext) return "insecure";
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
  if (ios && !standalone) return "install-required";
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && "caches" in window ? "supported" : "unsupported";
}

const emptyState: PushPrivacyState = { status: "disabled", ownerId: null, serverCleanupRequired: false };
async function readState(): Promise<PushPrivacyState> {
  const raw = await preferencesStorage.getItem(STATE);
  if (!raw) return emptyState;
  try {
    const state = JSON.parse(raw) as PushPrivacyState;
    if (!["enabled", "disabled", "cleanup-pending"].includes(state.status) || typeof state.serverCleanupRequired !== "boolean" || (state.ownerId !== null && typeof state.ownerId !== "string")) throw new Error();
    return state;
  } catch { throw new Error("브라우저 알림 설정을 확인하지 못했어요."); }
}
async function hash(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}
async function request(path: string, init: RequestInit, ownerId: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try { return await fetchWithPinnedSession(path, { ...init, signal: controller.signal }, ownerId); }
  finally { clearTimeout(timeout); }
}
function reportPermission(action: string, ownerId: string) {
  void request("notifications/events", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "permission", action }) }, ownerId).catch(() => {});
}
async function ownRegistration() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return undefined;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const worker = registration?.active ?? registration?.waiting ?? registration?.installing;
  return worker && new URL(worker.scriptURL).pathname === SW ? registration : undefined;
}
async function revokeBrowser() {
  // 계정이 바뀌는 순간 대기·이미 표시된 알림도 숨긴다. 페이지·API 응답은 캐시하지 않는다.
  if (typeof caches !== "undefined") await caches.delete(CACHE);
  const registration = await ownRegistration();
  for (const notification of await registration?.getNotifications() ?? []) notification.close();
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription && !await subscription.unsubscribe()) throw new Error("브라우저 알림 해제를 다시 시도해주세요.");
}
const privacy = createPushPrivacyLifecycle({
  read: readState,
  async write(state) {
    await preferencesStorage.setItem(STATE, JSON.stringify(state));
    if (state.status === "disabled") await preferencesStorage.removeItem(SUBSCRIPTION);
  },
  async deleteServer() {
    const raw = await preferencesStorage.getItem(SUBSCRIPTION);
    if (!raw) return;
    const subscription = parseWebPushSubscription(JSON.parse(raw));
    const current = getSessionSnapshot();
    if (!current || !subscription) throw new Error("연결 후 브라우저 알림 정리를 다시 시도해주세요.");
    const response = await request("push/devices", { method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ installationId: `web_${await hash(subscription.endpoint)}`, webSubscription: subscription }) }, current.userId);
    if (!response.ok) throw new Error("브라우저 알림 정리가 아직 끝나지 않았어요.");
  },
  revokeNative: revokeBrowser,
});

async function registrationReady() {
  const existing = await navigator.serviceWorker.getRegistration("/");
  const worker = existing?.active ?? existing?.waiting ?? existing?.installing;
  if (worker && new URL(worker.scriptURL).pathname !== SW) throw new Error("브라우저의 기존 설치 상태를 확인해주세요.");
  await navigator.serviceWorker.register(SW, { scope: "/", updateViaCache: "none" });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([navigator.serviceWorker.ready, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("알림 준비 시간이 길어지고 있어요. 다시 켜주세요.")), 15_000);
    })]);
  } finally { clearTimeout(timer); }
}
async function register(ownerId: string, assertActive: () => void, create: boolean) {
  const configResponse = await request("push/web", { cache: "no-store" }, ownerId);
  if (!configResponse.ok) throw new Error("웹 알림 설정을 불러오지 못했어요.");
  const config = await configResponse.json() as { enabled: boolean; publicKey: string | null };
  if (!config.enabled || !config.publicKey) throw new Error("웹 알림을 준비 중이에요. 잠시 후 다시 시도해주세요.");
  assertActive();
  if (getSessionSnapshot()?.userId !== ownerId) throw new Error("계정이 바뀌었어요. 다시 켜주세요.");
  const registration = create ? await registrationReady() : await ownRegistration();
  if (!registration || Notification.permission !== "granted") return false;
  let subscription = await registration.pushManager.getSubscription();
  const applicationServerKey = subscription?.options.applicationServerKey;
  if (applicationServerKey && btoa(String.fromCharCode(...new Uint8Array(applicationServerKey))).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "") !== config.publicKey) {
    throw new Error("알림 설정이 변경됐어요. 이전 등록을 정리한 뒤 다시 켜주세요.");
  }
  if (!subscription && !create) return false;
  if (!subscription) {
    const key = Uint8Array.from(atob(config.publicKey.replaceAll("-", "+").replaceAll("_", "/")), ch => ch.charCodeAt(0));
    subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  }
  const normalized = parseWebPushSubscription(subscription.toJSON());
  if (!normalized) throw new Error("이 브라우저의 알림 구독을 확인하지 못했어요.");
  // 응답 유실·계정 전환 뒤에도 해당 브라우저 구독만 철회할 수 있도록 먼저 보관한다.
  await preferencesStorage.setItem(SUBSCRIPTION, JSON.stringify(normalized));
  assertActive();
  if (getSessionSnapshot()?.userId !== ownerId) throw new Error("계정이 바뀌었어요. 다시 켜주세요.");
  const response = await request("push/devices", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ installationId: `web_${await hash(normalized.endpoint)}`, platform: "web", token: JSON.stringify(normalized), locale: navigator.language }) }, ownerId);
  if (!response.ok) throw new Error("브라우저 알림을 등록하지 못했어요. 다시 시도해주세요.");
  assertActive();
  const cache = await caches.open(CACHE);
  await cache.put(OWNER, new Response(await hash(ownerId)));
  return true;
}

export function requestWebPushPermission(): Promise<NotificationPermission> {
  if (webPushAvailability() !== "supported") return Promise.resolve("default");
  if (Notification.permission !== "default") return Promise.resolve(Notification.permission);
  const permission = Notification.requestPermission();
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve("default"), 30_000);
    permission.then(resolve, () => resolve("denied")).finally(() => clearTimeout(timer));
  });
}
export function enableWebPushNotifications() {
  if (webPushAvailability() !== "supported") return Promise.resolve({ status: "unsupported" } as const);
  const owner = getSessionSnapshot();
  if (!owner) return Promise.reject(new Error("계정을 확인한 뒤 알림을 켜주세요."));
  // iOS 권한 창은 사용자가 버튼을 누른 호출 스택에서 시작해야 한다.
  const requested = Notification.permission === "default";
  const permission = requestWebPushPermission();
  if (requested) reportPermission("permission-requested", owner.userId);
  return recoverWebPushPrivacy().then(() => privacy.enable(owner.userId, async assertActive => {
    const granted = await permission === "granted";
    reportPermission(granted ? "permission-granted" : "permission-denied", owner.userId);
    if (!granted) return false;
    return register(owner.userId, assertActive, true);
  })).then(registered => ({ status: registered ? "registered" : "denied" } as const));
}
export async function getWebPushStatus(): Promise<PushNotificationStatus> {
  if (webPushAvailability() !== "supported") return { supported: false, permission: "unsupported" };
  const state = await readState();
  const subscription = await (await ownRegistration())?.pushManager.getSubscription();
  return { supported: true, permission: Notification.permission === "default" ? "prompt" : Notification.permission,
    registered: Boolean(subscription && state.status === "enabled" && state.ownerId === getSessionSnapshot()?.userId) };
}
export async function recoverWebPushPrivacy() {
  const state = await readState();
  const owner = getSessionSnapshot();
  if (!owner) return null;
  if (state.status === "enabled" && state.ownerId !== owner.userId) { await privacy.revoke(state.ownerId); return false; }
  return privacy.recover();
}
export async function syncWebPushRegistration() {
  const owner = getSessionSnapshot();
  if (!owner || webPushAvailability() !== "supported") return false;
  return privacy.sync(owner.userId, assertActive => register(owner.userId, assertActive, false));
}
export async function disableWebPushNotifications() { await privacy.revoke(getSessionSnapshot()?.userId ?? null); }
export async function suspendWebPushForSessionChange() {
  if (Capacitor.isNativePlatform() || typeof window === "undefined") return;
  // 즉시 등록 세대를 취소한다. 저장소·서버가 실패해도 워커 표시와 브라우저 구독은 별도로 끈다.
  const results = await Promise.allSettled([privacy.revoke(getSessionSnapshot()?.userId ?? null), revokeBrowser()]);
  const failed = results.find(result => result.status === "rejected");
  if (failed?.status === "rejected") throw failed.reason;
}
export async function prepareWebPushForDeletion(owner: string) {
  if (typeof window !== "undefined") await privacy.prepareAccountDeletion(owner);
}
export async function finishWebPushAfterDeletion() {
  if (typeof window === "undefined") return true;
  try { await privacy.finishAccountDeletion(); return true; } catch { return false; }
}
