"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { RecommendationReadyFlow } from "@/features/tuti/flows/RecommendationReadyFlow";
import { IntakeFlow } from "@/features/tuti/flows/IntakeFlow";
import { WelcomeScreen } from "@/features/tuti/screens/onboarding/WelcomeScreen";
import { recordProductInteraction } from "@/lib/productInteraction";
import { recordProductActivity } from "@/lib/productActivity";
import { useTutiStore } from "@/store/tuti";
import { parseWelcomeGuideStep, welcomeGuidePath, type WelcomeGuideStep } from "@/shared/tuti/welcomeGuide";
import { parseWelcomeHarumadiPage, welcomeHarumadiPath } from "@/shared/tuti/welcomeHarumadi";
import { setWelcomeHarumadiOrigin } from "@/lib/welcomeHarumadiNavigation";
import { readLibraryEntryCompleted } from "@/lib/libraryPreferences";
import { useSession } from "@/features/tuti/hooks/useSession";

export function EntryFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const ownerId = useSession()?.userId;
  const [completion, setCompletion] = useState<{ ownerId: string; completed: boolean } | null>(null);
  const completionReady = Boolean(ownerId && completion?.ownerId === ownerId);
  const entryCompleted = completionReady && completion?.completed === true;
  useEffect(() => {
    if (!ownerId) return;
    let active = true;
    void readLibraryEntryCompleted(ownerId).then(completed => {
      if (active) setCompletion({ ownerId, completed });
    });
    return () => { active = false; };
  }, [ownerId]);
  const questionsRequested = params.get("mode") === "questions";
  const guideStep = parseWelcomeGuideStep(params.get("mode"), params.get("step"));
  const legacyExample = params.get("mode") === "harumadi";
  const hasHydrated = useTutiStore((state) => state.hasHydrated);
  const entryRecord = useTutiStore((state) => state.entryRecord);
  const entryStage = useTutiStore((state) => state.entryStage);
  const startRecord = () => {
    void recordProductInteraction("welcome_record_started", "welcome").catch(() => {});
    router.replace("/madi/new?from=welcome");
  };

  const shouldRedirectToMain =
    hasHydrated &&
    completionReady && !legacyExample &&
    (entryCompleted || (Boolean(entryRecord) && guideStep === null && entryStage !== "recommendation-ready"));

  useEffect(() => {
    if (!hasHydrated || !completionReady) return;
    if (legacyExample) {
      router.replace(welcomeHarumadiPath(parseWelcomeHarumadiPage(params.get("page"))));
      return;
    }
    if (questionsRequested || entryStage === "recommendation-ready") {
      router.replace(questionsRequested ? "/explore?mode=questions" : "/explore");
      return;
    }
    if (shouldRedirectToMain) {
      router.replace("/");
    }
  }, [router, shouldRedirectToMain, questionsRequested, entryStage, legacyExample, params, hasHydrated, completionReady]);

  useEffect(() => {
    if (!hasHydrated || !completionReady || shouldRedirectToMain || legacyExample || entryStage === "recommendation-ready") return;

    if (!questionsRequested) {
      if (guideStep === null) {
        void recordProductInteraction("welcome_viewed", "welcome").catch(() => {});
      }
      return;
    }

    void recordProductActivity("entry_started").catch(() => {
      // 분석 기록 실패가 질문 흐름을 막지 않도록 한다.
    });
  }, [legacyExample, entryStage, guideStep, hasHydrated, questionsRequested, shouldRedirectToMain, completionReady]);

  if (!hasHydrated || !completionReady || shouldRedirectToMain || legacyExample) return null;

  if (entryStage !== "recommendation-ready" && !questionsRequested) {
    return <WelcomeScreen
      guideStep={guideStep}
      onBookOpen={(origin) => {
        setWelcomeHarumadiOrigin(origin);
        router.push(welcomeHarumadiPath(1));
      }}
      onGuideOpen={() => router.replace(welcomeGuidePath(0))}
      onGuideNext={() => {
        if (guideStep !== null && guideStep < 2) router.replace(welcomeGuidePath((guideStep + 1) as WelcomeGuideStep));
      }}
      onGuideBack={() => router.replace(guideStep === null || guideStep === 0 ? "/entry" : welcomeGuidePath((guideStep - 1) as WelcomeGuideStep))}
      onRecord={startRecord}
      onExplore={() => {
        void recordProductInteraction("welcome_explore_started", "welcome").catch(() => {});
        router.replace("/explore");
      }}
    />;
  }

  return entryStage === "recommendation-ready" ? (
    <RecommendationReadyFlow />
  ) : (
    <IntakeFlow />
  );
}
