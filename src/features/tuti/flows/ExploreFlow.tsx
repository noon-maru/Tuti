"use client";

import { useSearchParams } from "next/navigation";
import styled from "@emotion/styled";
import { IntakeFlow } from "./IntakeFlow";
import { RecommendationReadyFlow } from "./RecommendationReadyFlow";
import { RecommendationsFlow } from "./RecommendationsFlow";
import { MainNavigation } from "@/features/tuti/components/MainNavigation";
import { useTutiStore } from "@/store/tuti";
import { useEffect, useState } from "react";
import type { DogOuting } from "@/shared/pets/dogAccess";
import { DogOutingControls } from "../components/DogOutingControls";
import { useSession } from "@/features/tuti/hooks/useSession";
import { markLibraryEntryCompleted } from "@/lib/libraryPreferences";
import { ExploreLocationGate } from "@/features/tuti/location/ExploreLocationGate";
import { AppLoadingScreen } from "@/features/tuti/components/LoadingIndicator";

export function ExploreFlow() {
  const params = useSearchParams();
  const ownerId = useSession()?.userId;
  const [dogOuting, setDogOuting] = useState<{ ownerId: string; value: DogOuting }>();
  const currentDogOuting = dogOuting?.ownerId === ownerId ? dogOuting?.value : undefined;
  useEffect(() => {
    if (ownerId) void markLibraryEntryCompleted(ownerId);
  }, [ownerId]);
  const entryRecord = useTutiStore(state => state.entryRecord);
  const withDog = useTutiStore(state => state.answers.petCompanion === "dog");
  const stage = useTutiStore(state => state.entryStage);
  const questions = params.get("mode") === "questions";
  return <Frame>
    {ownerId && withDog && entryRecord && !questions && stage !== "recommendation-ready" && <DogOutingControls key={ownerId} value={currentDogOuting} onChange={value => setDogOuting(value ? { ownerId, value } : undefined)} />}
    <Content>{ownerId ? <ExploreLocationGate key={ownerId}>{stage === "recommendation-ready" ? <RecommendationReadyFlow /> : !entryRecord || questions ? <IntakeFlow /> : <RecommendationsFlow interactive dogOuting={currentDogOuting} />}</ExploreLocationGate> : <AppLoadingScreen />}</Content>
    <MainNavigation active="explore" />
  </Frame>;
}
const Frame = styled.div`height: 100%; min-height: 0; display: flex; flex-direction: column; background: var(--color-surface);`;
const Content = styled.div`--app-safe-area-bottom: 0px; flex: 1; min-height: 0; position: relative;`;
