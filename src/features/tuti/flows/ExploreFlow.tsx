"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Compass, Library } from "lucide-react";
import styled from "@emotion/styled";
import { IntakeFlow } from "./IntakeFlow";
import { RecommendationReadyFlow } from "./RecommendationReadyFlow";
import { RecommendationsFlow } from "./RecommendationsFlow";
import { BaseButton } from "@/features/tuti/components/buttons";
import { useTutiStore } from "@/store/tuti";

export function ExploreFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const entryRecord = useTutiStore(state => state.entryRecord);
  const stage = useTutiStore(state => state.entryStage);
  const questions = params.get("mode") === "questions";
  return <Frame>
    <Navigation aria-label="장소 탐색">
      <BaseButton type="button" onClick={() => router.push("/")} aria-label="내 책장으로"><Library size={17} />내 책장</BaseButton>
      <span><Compass size={15} />가까운 공간</span>
    </Navigation>
    <Content>{stage === "recommendation-ready" ? <RecommendationReadyFlow /> : !entryRecord || questions ? <IntakeFlow /> : <RecommendationsFlow interactive />}</Content>
  </Frame>;
}
const Frame = styled.div`height: 100%; display: flex; flex-direction: column; background: var(--color-surface);`;
const Navigation = styled.nav`
  display: flex; align-items: center; justify-content: space-between; flex: none;
  padding: calc(var(--app-safe-area-top, 0px) + 8px) 20px 4px; min-height: 44px;
  button, span { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; }
  button { padding: 8px 0; color: var(--color-text); background: transparent; }
  > span { color: var(--color-text-muted); }
`;
const Content = styled.div`flex: 1; min-height: 0; position: relative;`;
