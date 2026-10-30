"use client";
import { useEffect } from "react";
import { observeActivity, flushLifecycle } from "@/lib/lifecycle";
export function LifecycleObserver() {
  useEffect(() => {
    const activity = () => observeActivity();
    const retry = () => { void flushLifecycle(); };
    document.addEventListener("pointerdown", activity, { passive: true });
    document.addEventListener("keydown", activity);
    window.addEventListener("online", retry);
    // This timer only retries existing observations; it does not manufacture activity.
    const timer = window.setInterval(retry, 30_000);
    return () => { document.removeEventListener("pointerdown", activity); document.removeEventListener("keydown", activity); window.removeEventListener("online", retry); window.clearInterval(timer); };
  }, []);
  return null;
}
