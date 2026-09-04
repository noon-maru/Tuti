"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { RecommendationReadyFlow } from "@/features/tuti/flows/RecommendationReadyFlow";
import { IntakeFlow } from "@/features/tuti/flows/IntakeFlow";
import { recordProductActivity } from "@/lib/productActivity";
import { useTutiStore } from "@/store/tuti";

export function EntryFlow() {
  const router = useRouter();
  const hasHydrated = useTutiStore((state) => state.hasHydrated);
  const entryRecord = useTutiStore((state) => state.entryRecord);
  const entryStage = useTutiStore((state) => state.entryStage);

  const shouldRedirectToMain =
    hasHydrated &&
    Boolean(entryRecord) &&
    entryStage !== "recommendation-ready";

  useEffect(() => {
    if (shouldRedirectToMain) {
      router.replace("/");
    }
  }, [router, shouldRedirectToMain]);

  useEffect(() => {
    if (!hasHydrated || shouldRedirectToMain) return;

    void recordProductActivity("entry_started").catch(() => {
      // 분석 기록 실패가 질문 흐름을 막지 않도록 한다.
    });
  }, [hasHydrated, shouldRedirectToMain]);

  if (!hasHydrated || shouldRedirectToMain) return null;

  return entryStage === "recommendation-ready" ? (
    <RecommendationReadyFlow />
  ) : (
    <IntakeFlow />
  );
}
