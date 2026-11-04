"use client";
import { useSyncExternalStore } from "react";
import { Capacitor } from "@capacitor/core";
import { webPushAvailability } from "../notifications/webPushNotifications";
import { WEB_PUSH_USER_ENABLED } from "@/shared/notifications/rollout";

function subscribe(changed: () => void) {
  window.addEventListener("pageshow", changed);
  document.addEventListener("visibilitychange", changed);
  return () => { window.removeEventListener("pageshow", changed); document.removeEventListener("visibilitychange", changed); };
}
function snapshot() {
  return Capacitor.isNativePlatform() ? "native" as const : WEB_PUSH_USER_ENABLED ? webPushAvailability() : "unsupported" as const;
}
export function usePushEnvironment() {
  return useSyncExternalStore(subscribe, snapshot, () => "checking" as const);
}
