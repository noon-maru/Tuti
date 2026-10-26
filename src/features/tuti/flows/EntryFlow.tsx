"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { RecommendationReadyFlow } from "@/features/tuti/flows/RecommendationReadyFlow";
import { IntakeFlow } from "@/features/tuti/flows/IntakeFlow";
import { WelcomeScreen } from "@/features/tuti/screens/onboarding/WelcomeScreen";
import { WelcomeHarumadiPreview } from "@/features/tuti/screens/onboarding/WelcomeHarumadiPreview";
import { recordProductInteraction } from "@/lib/productInteraction";
import { recordProductActivity } from "@/lib/productActivity";
import { useTutiStore } from "@/store/tuti";
import { parseWelcomeGuideStep, welcomeGuidePath, type WelcomeGuideStep } from "@/shared/tuti/welcomeGuide";
import { parseWelcomeHarumadiPage, welcomeHarumadiPath, type WelcomeHarumadiOrigin } from "@/shared/tuti/welcomeHarumadi";
import { ensureSession } from "@/lib/auth/session";
import { markLibraryWelcomeSeen } from "@/lib/libraryPreferences";

export function EntryFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const questionsRequested = params.get("mode") === "questions";
  const guideStep = parseWelcomeGuideStep(params.get("mode"), params.get("step"));
  const harumadiPage = parseWelcomeHarumadiPage(params.get("mode"), params.get("page"));
  const [harumadiOrigin, setHarumadiOrigin] = useState<WelcomeHarumadiOrigin | null>(null);
  const hasHydrated = useTutiStore((state) => state.hasHydrated);
  const entryRecord = useTutiStore((state) => state.entryRecord);
  const entryStage = useTutiStore((state) => state.entryStage);
  const startRecord = () => {
    void recordProductInteraction("welcome_record_started", "welcome").catch(() => {});
    router.push("/journal/new?from=welcome");
  };

  const shouldRedirectToMain =
    hasHydrated &&
    Boolean(entryRecord) &&
    guideStep === null && harumadiPage === null &&
    entryStage !== "recommendation-ready";

  useEffect(() => {
    if (questionsRequested || entryStage === "recommendation-ready") {
      router.replace(questionsRequested ? "/explore?mode=questions" : "/explore");
      return;
    }
    if (shouldRedirectToMain) {
      router.replace("/");
    }
  }, [router, shouldRedirectToMain, questionsRequested, entryStage]);

  useEffect(() => {
    if (!hasHydrated || shouldRedirectToMain || entryStage === "recommendation-ready") return;

    if (!questionsRequested) {
      if (guideStep === null && harumadiPage === null) {
        void ensureSession().then(session => markLibraryWelcomeSeen(session.userId)).catch(() => {});
        void recordProductInteraction("welcome_viewed", "welcome").catch(() => {});
      }
      return;
    }

    void recordProductActivity("entry_started").catch(() => {
      // 분석 기록 실패가 질문 흐름을 막지 않도록 한다.
    });
  }, [harumadiPage, entryStage, guideStep, hasHydrated, questionsRequested, shouldRedirectToMain]);

  if (!hasHydrated || shouldRedirectToMain) return null;

  if (entryStage !== "recommendation-ready" && harumadiPage !== null) {
    return <WelcomeHarumadiPreview page={harumadiPage} origin={harumadiOrigin}
      onPageChange={(page) => router.replace(welcomeHarumadiPath(page, params.get("from") === "guide"))}
      onRecord={startRecord}
      onClose={() => router.replace(params.get("from") === "guide" ? welcomeGuidePath(2) : "/entry")} />;
  }

  if (entryStage !== "recommendation-ready" && !questionsRequested) {
    return <WelcomeScreen
      guideStep={guideStep}
      onBookOpen={(origin) => {
        setHarumadiOrigin(origin);
        router.push(welcomeHarumadiPath(1, guideStep !== null));
      }}
      onGuideOpen={() => router.push(welcomeGuidePath(0))}
      onGuideNext={() => {
        if (guideStep !== null && guideStep < 2) router.push(welcomeGuidePath((guideStep + 1) as WelcomeGuideStep));
      }}
      onGuideBack={() => router.replace(guideStep === null || guideStep === 0 ? "/entry" : welcomeGuidePath((guideStep - 1) as WelcomeGuideStep))}
      onRecord={startRecord}
      onExplore={() => {
        void recordProductInteraction("welcome_explore_started", "welcome").catch(() => {});
        router.push("/explore");
      }}
    />;
  }

  return entryStage === "recommendation-ready" ? (
    <RecommendationReadyFlow />
  ) : (
    <IntakeFlow />
  );
}
