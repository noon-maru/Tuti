"use client";

import { useEffect } from "react";
import { ensureSession } from "@/lib/auth/session";

export function SessionBootstrap() {
  useEffect(() => {
    void ensureSession().catch(() => {
      // API requests retry session creation and surface errors when needed.
    });
  }, []);

  return null;
}
