"use client";
import { useEffect, useRef } from "react";
import type { ClientLifecycleName, LifecycleContext } from "@/shared/api/lifecycle";
import { trackLifecycle } from "@/lib/lifecycle";
import { useSession } from "./useSession";

export function useLifecycleView(name: ClientLifecycleName, source: LifecycleContext["source"], entityId?: string, enabled = true) {
  const owner = useSession()?.userId;
  const seen = useRef("");
  useEffect(() => {
    if (!enabled || !owner) { seen.current = ""; return; }
    const key = `${owner}:${name}:${entityId ?? ""}`;
    const visible = () => {
      if (document.visibilityState !== "visible") { seen.current = ""; return; }
      if (seen.current === key) return;
      seen.current = key;
      trackLifecycle(name, { source, entityId });
    };
    visible(); document.addEventListener("visibilitychange", visible);
    return () => { document.removeEventListener("visibilitychange", visible); };
  }, [owner, name, source, entityId, enabled]);
}
