"use client";
import { useEffect } from "react";
import { fetchWithPinnedSession } from "@/lib/auth/session";
import { useSession } from "./useSession";
export function useNotificationPresence(bookId: string | null, composing = false, enabled = true) {
  const owner = useSession()?.userId;
  useEffect(() => {
    if (!owner || !enabled) return;
    const sessionId = crypto.randomUUID();
    const update = (active: boolean) => {
      void fetchWithPinnedSession("notifications/presence", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, bookId, composing, active }), keepalive: true }, owner).catch(() => {});
    };
    const visible = () => update(document.visibilityState === "visible");
    visible(); const timer = setInterval(visible, 30_000);
    document.addEventListener("visibilitychange", visible);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", visible); update(false); };
  }, [owner, bookId, composing, enabled]);
}
