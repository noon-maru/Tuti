"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { BrowserHistoryTransitionProvider } from "@/features/tuti/components/BrowserHistoryTransition";
import { JournalEntryTransitionProvider } from "@/features/tuti/components/JournalEntryTransition";
import { AppLoadingScreen } from "@/features/tuti/components/LoadingIndicator";
import { recordProductActivity } from "@/lib/productActivity";
import { useTutiStore } from "@/store/tuti";
import { useServiceRightsOnly } from "@/features/legal/ServiceAccessContext";

export function MainFlow({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const rightsOnly = useServiceRightsOnly();
  const hasHydrated = useTutiStore(state => state.hasHydrated);
  const entryRecord = useTutiStore(state => state.entryRecord);
  useEffect(() => {
    // 기존 추천 도달 이벤트의 의미를 홈 개편 이후에도 유지한다.
    if (rightsOnly || !hasHydrated || !entryRecord || pathname !== "/explore") return;
    void recordProductActivity("main_viewed").catch(() => {});
  }, [entryRecord, hasHydrated, pathname, rightsOnly]);
  if (!hasHydrated) return <AppLoadingScreen label="저장된 상태를 확인하고 있어요." />;
  return <BrowserHistoryTransitionProvider><JournalEntryTransitionProvider>{children}</JournalEntryTransitionProvider></BrowserHistoryTransitionProvider>;
}
