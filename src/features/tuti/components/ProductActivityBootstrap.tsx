"use client";

import { useEffect } from "react";
import { recordProductActivity } from "@/lib/productActivity";
import { flushProductInteractions } from "@/lib/productInteraction";

export function ProductActivityBootstrap() {
  useEffect(() => {
    const flush = () => { void flushProductInteractions().catch(() => {}); };
    flush();
    window.addEventListener("online", flush);
    void recordProductActivity("session_started").catch(() => {
      // 분석 기록은 사용자 흐름을 막지 않으며 다음 마운트에서 다시 시도한다.
    });
    return () => window.removeEventListener("online", flush);
  }, []);

  return null;
}
