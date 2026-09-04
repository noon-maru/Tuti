import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { fetchWithSession } from "@/lib/auth/session";
import type {
  ProductActivityInput,
  ProductActivityPlatform,
  ProductActivityType,
} from "@/shared/api/productActivity";

const ACTIVITY_SESSION_KEY = "tuti-product-activity-session";
const recordedEvents = new Set<string>();
let appVersionPromise: Promise<string | undefined> | undefined;
let memorySessionId: string | undefined;

export async function recordProductActivity(action: ProductActivityType) {
  const clientSessionId = getClientSessionId();
  const eventKey = `${clientSessionId}:${action}`;
  if (recordedEvents.has(eventKey)) return;

  recordedEvents.add(eventKey);
  try {
    const input: ProductActivityInput = {
      clientSessionId,
      action,
      platform: getPlatform(),
      ...(await getAppVersion()),
    };
    const response = await fetchWithSession("product-activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      keepalive: true,
    });

    if (!response.ok) {
      throw new Error(`제품 활동 기록 실패: ${response.status}`);
    }
  } catch (error) {
    recordedEvents.delete(eventKey);
    throw error;
  }
}

function getClientSessionId() {
  if (memorySessionId) return memorySessionId;

  const created = crypto.randomUUID();
  try {
    const stored = window.sessionStorage.getItem(ACTIVITY_SESSION_KEY);
    if (stored) {
      memorySessionId = stored;
      return stored;
    }
    window.sessionStorage.setItem(ACTIVITY_SESSION_KEY, created);
  } catch {
    // 저장소가 차단된 브라우저에서는 현재 페이지 생명주기 동안만 유지한다.
  }

  memorySessionId = created;
  return memorySessionId;
}

function getPlatform(): ProductActivityPlatform {
  const platform = Capacitor.getPlatform();
  return platform === "android" || platform === "ios" ? platform : "web";
}

async function getAppVersion() {
  if (!Capacitor.isNativePlatform()) return {};

  appVersionPromise ??= App.getInfo()
    .then((info) => `${info.version} (${info.build})`.slice(0, 40))
    .catch(() => undefined);
  const appVersion = await appVersionPromise;
  return appVersion ? { appVersion } : {};
}
