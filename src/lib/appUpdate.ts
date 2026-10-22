import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { apiUrl } from "@/lib/api/apiUrl";
import type {
  AppUpdatePolicyResponse,
  NativeAppPlatform,
} from "@/shared/api/appUpdate";

export async function fetchNativeAppUpdatePolicy() {
  const platform = getNativeAppPlatform();
  if (!platform) return null;

  const appInfo = await App.getInfo();
  const searchParams = new URLSearchParams({
    platform,
    version: appInfo.version,
  });
  const response = await fetch(apiUrl(`app-update?${searchParams}`), {
    cache: "no-store", signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("app_update_policy_unavailable");
  const policy = await response.json() as AppUpdatePolicyResponse;
  if (policy.platform !== platform || policy.currentVersion !== appInfo.version ||
      typeof policy.required !== "boolean" || typeof policy.updateAvailable !== "boolean" ||
      (policy.required && !policy.updateAvailable) ||
      (policy.updateAvailable && (typeof policy.latestVersion !== "string" || typeof policy.storeUrl !== "string" || !policy.storeUrl.startsWith("https://")))) {
    throw new Error("app_update_policy_invalid");
  }
  return policy;
}

export async function openNativeAppStore(storeUrl: string) {
  await Browser.open({ url: storeUrl });
}

function getNativeAppPlatform(): NativeAppPlatform | null {
  if (!Capacitor.isNativePlatform()) return null;
  const platform = Capacitor.getPlatform();
  return platform === "android" || platform === "ios" ? platform : null;
}
