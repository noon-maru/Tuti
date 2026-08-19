"use client";

import { App } from "@capacitor/app";
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

    const openCallback = (url?: string) => {
      if (!url) return;
      const loginPath = readNativeOAuthCallback(url);
      if (loginPath) router.replace(loginPath);
    };

    void App.addListener("appUrlOpen", ({ url }) => {
      openCallback(url);
    }).then((handle) => {
      if (disposed) {
        void handle.remove();
        return;
      }
      listener = handle;
    });

    void App.getLaunchUrl().then((result) => {
      if (!disposed) openCallback(result?.url);
    });

    return () => {
      disposed = true;
      void listener?.remove();
    };
  }, [router]);

  return null;
}
