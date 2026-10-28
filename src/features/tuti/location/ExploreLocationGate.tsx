"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AppLoadingScreen } from "@/features/tuti/components/LoadingIndicator";
import { ScreenFrame } from "@/features/tuti/components/ScreenFrame";
import { PrimaryButton } from "@/features/tuti/components/buttons";
import { hasRecommendationArea } from "@/shared/location/recommendationArea";
import { useTutiStore } from "@/store/tuti";
import { useLocationAccess } from "./LocationAccessProvider";
import { prepareRecommendationLocation } from "./prepareRecommendationLocation";

/** 홈·로그인은 위치 없이 이용하고, 작은 여행을 열 때만 추천 지역을 준비한다. */
export function ExploreLocationGate({ children }: { children: ReactNode }) {
  const { requestLocation } = useLocationAccess();
  const [state, setState] = useState<"pending" | "ready" | "error">(() => {
    const { userLocation, preferredRegion } = useTutiStore.getState();
    return hasRecommendationArea(userLocation, preferredRegion) ? "ready" : "pending";
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    // requestLocation은 서버의 현재 계정 동의를 먼저 확인한다.
    // 미동의라면 동의 시트, 거절·기기 조회 실패라면 지역 선택까지 기다린다.
    void prepareRecommendationLocation(useTutiStore.getState, requestLocation)
      .then(() => { if (active) setState("ready"); })
      .catch(() => { if (active) setState("error"); });
    return () => { active = false; };
  }, [attempt, requestLocation]);

  if (state === "ready") return children;
  if (state === "error") return <ScreenFrame role="alert">
    <p>작은 여행을 찾을 지역을 확인하지 못했어요.</p>
    <PrimaryButton onClick={() => { setState("pending"); setAttempt(value => value + 1); }}>다시 확인하기</PrimaryButton>
  </ScreenFrame>;
  return <AppLoadingScreen label="작은 여행을 찾을 지역을 확인하고 있어요." />;
}
