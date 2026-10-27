import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { apiUrl } from "@/lib/api/apiUrl";
import { CLIENT_PROTOCOL } from "@/shared/api/clientProtocol";
import type {
  AppUpdatePolicyResponse,
  NativeAppPlatform,
} from "@/shared/api/appUpdate";

const POLICY_CACHE_KEY = "tuti-app-update-policy";
export type CachedAppUpdatePolicy = {
  protocol: string;
  appId: string;
  build: string;
  policy: AppUpdatePolicyResponse;
};

export function readCachedAppUpdatePolicy(): CachedAppUpdatePolicy | null {
  try {
    const cached = JSON.parse(window.localStorage.getItem(POLICY_CACHE_KEY) ?? "null");
    const platform = getNativeAppPlatform();
    if (!platform || cached?.protocol !== CLIENT_PROTOCOL ||
        typeof cached.appId !== "string" || typeof cached.build !== "string" ||
        typeof cached.policy?.currentVersion !== "string" ||
        !isValidPolicy(cached.policy, platform, cached.policy.currentVersion)) return null;
    return cached;
  } catch { return null; }
}

export async function fetchNativeAppUpdatePolicy(onIdentity?: (identity: {
  appId: string; build: string; version: string;
}) => void) {
  const platform = getNativeAppPlatform();
  if (!platform) return null;

  const appInfo = await App.getInfo();
  onIdentity?.({ appId: appInfo.id, build: appInfo.build, version: appInfo.version });
  const searchParams = new URLSearchParams({
    platform,
    version: appInfo.version,
  });
  const response = await fetch(apiUrl(`app-update?${searchParams}`), {
    cache: "no-store", signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("app_update_policy_unavailable");
  const policy = await response.json() as AppUpdatePolicyResponse;
  if (!isValidPolicy(policy, platform, appInfo.version)) {
    throw new Error("app_update_policy_invalid");
  }
  try {
    window.localStorage.setItem(POLICY_CACHE_KEY, JSON.stringify({
      protocol: CLIENT_PROTOCOL, appId: appInfo.id, build: appInfo.build, policy,
    } satisfies CachedAppUpdatePolicy));
  } catch { /* 저장 실패는 이번 확인 성공에 영향을 주지 않는다. */ }
  return policy;
}

function isValidPolicy(policy: AppUpdatePolicyResponse | null, platform: NativeAppPlatform, version: string) {
  return !!policy && policy.platform === platform && policy.currentVersion === version &&
    typeof policy.required === "boolean" && typeof policy.updateAvailable === "boolean" &&
    !(policy.required && !policy.updateAvailable) &&
    (!policy.updateAvailable || (typeof policy.latestVersion === "string" &&
      typeof policy.storeUrl === "string" && policy.storeUrl.startsWith("https://")));
}

export async function openNativeAppStore(storeUrl: string) {
  await Browser.open({ url: storeUrl });
}

export function getNativeAppPlatform(): NativeAppPlatform | null {
  if (!Capacitor.isNativePlatform()) return null;
  const platform = Capacitor.getPlatform();
  return platform === "android" || platform === "ios" ? platform : null;
}
