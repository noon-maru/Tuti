"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserHistoryTransitionProvider } from "@/features/tuti/components/BrowserHistoryTransition";
import { JournalEntryTransitionProvider } from "@/features/tuti/components/JournalEntryTransition";
import { AppLoadingScreen } from "@/features/tuti/components/LoadingIndicator";
import { RecommendationsFlow } from "@/features/tuti/flows/RecommendationsFlow";
import { recordProductActivity } from "@/lib/productActivity";
import { useTutiStore } from "@/store/tuti";
import { useServiceRightsOnly } from "@/features/legal/ServiceAccessContext";

export function MainFlow({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const rightsOnly = useServiceRightsOnly();
  const hasHydrated = useTutiStore((state) => state.hasHydrated);
  const entryRecord = useTutiStore((state) => state.entryRecord);
  const [revealedDestination, setRevealedDestination] =
    useState<string | null>(null);
  const revealResetTimer = useRef<number | null>(null);

  const revealDestination = useCallback((destinationPath: string) => {
    setRevealedDestination(destinationPath);

    if (revealResetTimer.current) {
      window.clearTimeout(revealResetTimer.current);
    }

    revealResetTimer.current = window.setTimeout(() => {
      setRevealedDestination(null);
      revealResetTimer.current = null;
    }, 1200);
  }, []);

  useEffect(() => {
    if (!rightsOnly && hasHydrated && !entryRecord) {
      router.replace("/entry");
    }
  }, [entryRecord, hasHydrated, rightsOnly, router]);

  useEffect(() => {
    if (rightsOnly || !hasHydrated || !entryRecord || pathname !== "/") return;

    void recordProductActivity("main_viewed").catch(() => {
      // 분석 기록 실패가 메인 추천 화면을 막지 않도록 한다.
    });
  }, [entryRecord, hasHydrated, pathname, rightsOnly]);

  useEffect(
    () => () => {
      if (revealResetTimer.current) {
        window.clearTimeout(revealResetTimer.current);
      }
    },
    [],
  );

  if (!hasHydrated || (!rightsOnly && !entryRecord)) {
    return <AppLoadingScreen label="저장된 상태를 확인하고 있어요." />;
  }

  return (
    <BrowserHistoryTransitionProvider
      onDestinationReveal={revealDestination}
    >
      <JournalEntryTransitionProvider>
        {!rightsOnly && <RecommendationsFlow
          interactive={
            pathname === "/" || revealedDestination === "/"
          }
        />}
        {children}
      </JournalEntryTransitionProvider>
    </BrowserHistoryTransitionProvider>
  );
}
