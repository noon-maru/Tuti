"use client";

import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { readNativeOAuthCallback } from "@/shared/auth/nativeOAuth";

export function NativeOAuthCallbackHandler() {
  const router = useRouter();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let disposed = false;
    let listener: PluginListenerHandle | null = null;

    const openCallback = async (url?: string) => {
      if (!url) return;
      const loginPath = readNativeOAuthCallback(url);
      if (!loginPath) return;

      try {
        await Browser.close();
      } catch {
        // Android에서는 외부 브라우저가 이미 닫혔거나 close를 지원하지 않을 수 있습니다.
      }

      if (!disposed) router.replace(loginPath);
    };

    void App.addListener("appUrlOpen", ({ url }) => {
      void openCallback(url);
    }).then((handle) => {
      if (disposed) {
        void handle.remove();
        return;
      }
      listener = handle;
    });

    void App.getLaunchUrl().then((result) => {
      if (!disposed) void openCallback(result?.url);
    });

    return () => {
      disposed = true;
      void listener?.remove();
    };
  }, [router]);

  return null;
}
