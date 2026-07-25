"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  ensureSession,
  getSessionSnapshot,
  subscribeToSession,
} from "@/lib/auth/session";

export function useSession() {
  const session = useSyncExternalStore(
    subscribeToSession,
    getSessionSnapshot,
    () => null,
  );

  useEffect(() => {
    void ensureSession().catch(() => {
      // Account actions surface session preparation failures to the user.
    });
  }, []);

  return session;
}
