"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AppLoadingScreen } from "@/features/tuti/components/LoadingIndicator";
import { ScreenFrame } from "@/features/tuti/components/ScreenFrame";
import { PrimaryButton } from "@/features/tuti/components/buttons";
import { useTutiStore } from "@/store/tuti";
import { useLocationAccess } from "./LocationAccessProvider";
import { isRecommendationLocationReady, needsRecommendationRegionChoice, prepareRecommendationLocation } from "./prepareRecommendationLocation";

/** 홈·로그인은 위치 없이 이용하고, 작은 여행을 열 때만 추천 지역을 준비한다. */
export function ExploreLocationGate({ children }: { children: ReactNode }) {
  const { requestLocation, requestRegionPreference, resolvingLocation } = useLocationAccess();
  const prepared = useTutiStore(isRecommendationLocationReady);
  const hasHydrated = useTutiStore(state => state.hasHydrated);
  const [state, setState] = useState<"pending" | "ready" | "error">(() => {
    return isRecommendationLocationReady(useTutiStore.getState()) ? "ready" : "pending";
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // 철회·중지 및 실패 후 지역 선택 중에는 자동 복원이 새 요청을 시작하지 않는다.
    if (!hasHydrated || resolvingLocation) return;
    let active = true;
    // requestLocation은 서버의 현재 계정 동의를 먼저 확인한다.
    // 미동의라면 동의 시트, 거절·기기 조회 실패라면 지역 선택까지 기다린다.
    void prepareRecommendationLocation(useTutiStore.getState, requestLocation)
      .then(() => { if (active) setState("ready"); })
      .catch(() => { if (active) setState("error"); });
    return () => { active = false; };
  }, [attempt, requestLocation, prepared, hasHydrated, resolvingLocation]);

  if (hasHydrated && state === "ready" && prepared) return children;
  if (state === "error") return <ScreenFrame role="alert">
    <p>작은 여행을 찾을 지역을 확인하지 못했어요.</p>
    <PrimaryButton onClick={() => {
      if (needsRecommendationRegionChoice(useTutiStore.getState())) { requestRegionPreference(); return; }
      setState("pending"); setAttempt(value => value + 1);
    }}>다시 확인하기</PrimaryButton>
  </ScreenFrame>;
  return <AppLoadingScreen label="작은 여행을 찾을 지역을 확인하고 있어요." />;
}
