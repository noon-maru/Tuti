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
    cache: "no-store",
  });
  if (!response.ok) throw new Error("app_update_policy_unavailable");
  return (await response.json()) as AppUpdatePolicyResponse;
}

export async function openNativeAppStore(storeUrl: string) {
  await Browser.open({ url: storeUrl });
}

function getNativeAppPlatform(): NativeAppPlatform | null {
  if (!Capacitor.isNativePlatform()) return null;
  const platform = Capacitor.getPlatform();
  return platform === "android" || platform === "ios" ? platform : null;
}
