"use client";

import { useEffect, useState, type ReactNode } from "react";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { useSession } from "@/features/tuti/hooks/useSession";
import { getLocationTermsVersion } from "@/shared/location/terms";
import { AppLoadingScreen } from "@/features/tuti/components/LoadingIndicator";
import { ScreenFrame } from "@/features/tuti/components/ScreenFrame";
import { PrimaryButton } from "@/features/tuti/components/buttons";
import { useTutiStore } from "@/store/tuti";
import { useLocationAccess } from "./LocationAccessProvider";
import { isRecommendationLocationReady, needsRecommendationRegionChoice, prepareRecommendationLocation } from "./prepareRecommendationLocation";
import { isValidRecommendationSnapshot } from "@/features/tuti/recommendationSnapshot";

/** 홈·로그인은 위치 없이 이용하고, 작은 여행을 열 때만 추천 지역을 준비한다. */
export function ExploreLocationGate({ children }: { children: ReactNode }) {
  const { requestLocation, refreshDeviceLocation, requestRegionPreference, resolvingLocation } = useLocationAccess();
  const ownerId = useSession()?.userId;
  const cached = useTutiStore(state => state.dailyRecommendation);
  const consent = useTutiStore(state => state.locationConsent);
  const canShowCache = isValidRecommendationSnapshot(cached) && cached.ownerId === ownerId &&
    (!cached.locationAnchor || (consent?.status === "accepted" && consent.termsVersion === getLocationTermsVersion()));
  const prepared = useTutiStore(isRecommendationLocationReady);
  const hasHydrated = useTutiStore(state => state.hasHydrated);
  const [state, setState] = useState<"pending" | "ready" | "error">(() => {
    return isRecommendationLocationReady(useTutiStore.getState()) ? "ready" : "pending";
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!hasHydrated || !ownerId) return;
    const check = () => { if (document.visibilityState === "visible") void refreshDeviceLocation(); };
    check();
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    const timer = window.setInterval(check, 5 * 60_000);
    const listener = Capacitor.isNativePlatform() ? App.addListener("appStateChange", ({ isActive }) => { if (isActive) check(); }) : null;
    return () => {
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
      window.clearInterval(timer);
      if (listener) void listener.then(handle => handle.remove());
    };
  }, [hasHydrated, ownerId, refreshDeviceLocation]);

  useEffect(() => {
    // 철회·중지 및 실패 후 지역 선택 중에는 자동 복원이 새 요청을 시작하지 않는다.
    if (!hasHydrated || resolvingLocation) return;
    let active = true;
    // requestLocation은 서버의 현재 계정 동의를 먼저 확인한다.
    // 미동의라면 동의 시트, 거절·기기 조회 실패라면 지역 선택까지 기다린다.
    void prepareRecommendationLocation(useTutiStore.getState, canShowCache ? async () => { await refreshDeviceLocation(); } : requestLocation)
      .then(() => { if (active) setState("ready"); })
      .catch(() => { if (active) setState("error"); });
    return () => { active = false; };
  }, [attempt, requestLocation, refreshDeviceLocation, canShowCache, prepared, hasHydrated, resolvingLocation]);

  if (hasHydrated && canShowCache) return children;
  if (hasHydrated && state === "ready" && prepared) return children;
  if (state === "error") return <ScreenFrame role="alert">
    <p>나들이를 찾을 지역을 확인하지 못했어요.</p>
    <PrimaryButton onClick={() => {
      if (needsRecommendationRegionChoice(useTutiStore.getState())) { requestRegionPreference(); return; }
      setState("pending"); setAttempt(value => value + 1);
    }}>다시 확인하기</PrimaryButton>
  </ScreenFrame>;
  return <AppLoadingScreen label="나들이를 찾을 지역을 확인하고 있어요." />;
}
