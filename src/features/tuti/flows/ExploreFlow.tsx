"use client";

import { useSearchParams } from "next/navigation";
import styled from "@emotion/styled";
import { IntakeFlow } from "./IntakeFlow";
import { RecommendationReadyFlow } from "./RecommendationReadyFlow";
import { RecommendationsFlow } from "./RecommendationsFlow";
import { MainNavigation } from "@/features/tuti/components/MainNavigation";
import { useTutiStore } from "@/store/tuti";
import { useEffect } from "react";
import { useSession } from "@/features/tuti/hooks/useSession";
import { markLibraryEntryCompleted } from "@/lib/libraryPreferences";

export function ExploreFlow() {
  const params = useSearchParams();
  const ownerId = useSession()?.userId;
  useEffect(() => {
    if (ownerId) void markLibraryEntryCompleted(ownerId);
  }, [ownerId]);
  const entryRecord = useTutiStore(state => state.entryRecord);
  const stage = useTutiStore(state => state.entryStage);
  const questions = params.get("mode") === "questions";
  return <Frame>
    <Content>{stage === "recommendation-ready" ? <RecommendationReadyFlow /> : !entryRecord || questions ? <IntakeFlow /> : <RecommendationsFlow interactive />}</Content>
    <MainNavigation active="explore" />
  </Frame>;
}
const Frame = styled.div`height: 100%; min-height: 0; display: flex; flex-direction: column; background: var(--color-surface);`;
const Content = styled.div`--app-safe-area-bottom: 0px; flex: 1; min-height: 0; position: relative;`;
