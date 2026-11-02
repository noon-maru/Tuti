"use client";
import { useEffect } from "react";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { observeActivity, flushLifecycle, trackActiveDuration } from "@/lib/lifecycle";
import { getSessionSnapshot, subscribeToSession } from "@/lib/auth/session";
import { ACTIVE_HEARTBEAT_MS, createActiveTimeTracker } from "@/shared/analytics/activeTime";
export function LifecycleObserver() {
  useEffect(() => {
    let nativeActive = true, focused = Capacitor.isNativePlatform() || document.hasFocus(), disposed = false;
    let owner = getSessionSnapshot()?.userId;
    const tracker = createActiveTimeTracker(trackActiveDuration);
    const sample = (interaction = false, force = false) => tracker.sample(Date.now(), getSessionSnapshot()?.userId,
      document.visibilityState === "visible" && focused && nativeActive, interaction, force);
    const activity = () => { sample(true); observeActivity(); };
    const visibility = () => { sample(document.visibilityState === "visible", true); if (document.visibilityState === "visible") observeActivity(); };
    const focus = () => { focused = true; sample(true); observeActivity(); };
    const blur = () => { focused = false; sample(false, true); };
    const leave = () => { sample(false, true); tracker.reset(); };
    const retry = () => { void flushLifecycle(); };
    document.addEventListener("pointerdown", activity, { passive: true });
    document.addEventListener("keydown", activity);
    document.addEventListener("scroll", activity, { passive: true, capture: true });
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("focus", focus);
    window.addEventListener("blur", blur);
    window.addEventListener("pagehide", leave);
    window.addEventListener("online", retry);
    const unsubscribe = subscribeToSession(() => {
      const next = getSessionSnapshot()?.userId;
      if (next === owner) return;
      owner = next; tracker.reset(); sample(true); observeActivity();
    });
    sample(true); observeActivity();
    const timer = window.setInterval(() => { sample(); retry(); }, ACTIVE_HEARTBEAT_MS);
    const nativeListener = Capacitor.isNativePlatform() ? App.addListener("appStateChange", state => {
      if (disposed) return;
      nativeActive = state.isActive; if (state.isActive) focused = true;
      sample(state.isActive, true); if (state.isActive) observeActivity();
    }).then(handle => { if (disposed) void handle.remove().catch(() => {}); return handle; }).catch(() => null) : null;
    return () => {
      sample(false, true); tracker.reset(); disposed = true; unsubscribe();
      document.removeEventListener("pointerdown", activity); document.removeEventListener("keydown", activity);
      document.removeEventListener("scroll", activity, true); document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("focus", focus); window.removeEventListener("blur", blur); window.removeEventListener("pagehide", leave);
      window.removeEventListener("online", retry); window.clearInterval(timer);
      if (nativeListener) void nativeListener.then(handle => handle?.remove()).catch(() => {});
    };
  }, []);
  return null;
}
