"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSessionSnapshot, subscribeToSession } from "@/lib/auth/session";
import { HARUMADI_CACHE_INVALIDATED } from "@/lib/harumadiReadCache";

export function HarumadiCacheLifecycle() {
  const client = useQueryClient();
  useEffect(() => {
    let previous = getSessionSnapshot();
    const unsubscribe = subscribeToSession(() => {
      const next = getSessionSnapshot();
      if (previous && (previous.userId !== next?.userId || previous.accessToken !== next?.accessToken)) {
        const key = ["harumadi-content", previous.userId];
        void client.cancelQueries({ queryKey: key });
        client.removeQueries({ queryKey: key });
      }
      previous = next;
    });
    const invalidate = (event: Event) => {
      const owner = (event as CustomEvent<{ owner?: string }>).detail?.owner;
      if (owner) void client.invalidateQueries({ queryKey: ["harumadi-content", owner] });
    };
    window.addEventListener(HARUMADI_CACHE_INVALIDATED, invalidate);
    return () => { unsubscribe(); window.removeEventListener(HARUMADI_CACHE_INVALIDATED, invalidate); };
  }, [client]);
  return null;
}
