"use client";

import { useEffect } from "react";
import { ensureAnonymousSession } from "@/lib/auth/anonymousSession";

export function AnonymousSessionBootstrap() {
  useEffect(() => {
    void ensureAnonymousSession().catch(() => {
      // Journal requests retry session creation and surface errors when needed.
    });
  }, []);

  return null;
}
