import assert from "node:assert/strict";
import test from "node:test";
import { createJSONStorage } from "zustand/middleware";
import { QueryClient, QueryObserver, type QueryObserverOptions } from "@tanstack/react-query";
import { clientFlowHarness } from "./fixtures/clientFlowHarness";
import { useTutiStore } from "@/store/tuti";
import { recommendationConditionsKey, recommendationRegionKey, reusableRecommendation, hasMovedRecommendationOrigin } from "@/features/tuti/recommendationSnapshot";
import * as snapshotPolicy from "@/features/tuti/recommendationSnapshot";
import { withDefaultIntakeAnswers } from "@/lib/intakePreferences";
import { hasRecommendationArea } from "@/shared/location/recommendationArea";
import { getLocationTermsVersion } from "@/shared/location/terms";
import { interpretState } from "@/lib/recommendations";
import { readFileSync } from "node:fs";
import ts from "typescript";

const anchor = { latitude: 37.5665, longitude: 126.978, accuracy: 15 };
const nearby = { ...anchor, latitude: 37.569 };
const far = { ...anchor, latitude: 37.59 };
const region = { areaCode: "1", name: "서울", sigunguName: "종로구" };
const conditions = withDefaultIntakeAnswers();
const inputFingerprint = recommendationConditionsKey(conditions);
const snapshot = { snapshotVersion: 1 as const, ownerId: "owner", cycle: 0, effectiveDate: "2000-01-01", recommendationId: "original", algorithmVersion: "old", inputFingerprint,
  locationAnchor: anchor, regionKey: recommendationRegionKey(region), places: [] };

function reset() {
  useTutiStore.persist.setOptions({ storage: createJSONStorage(() => ({ getItem: () => null, setItem() {}, removeItem() {} })) });
  useTutiStore.getState().resetAllData();
  useTutiStore.setState({ hasHydrated: true, answers: conditions, userLocation: anchor, preferredRegion: region,
    locationConsent: { status: "accepted", termsVersion: getLocationTermsVersion(), updatedAt: "2026-11-17T00:00:00Z" } });
}

test("날짜·엔진 버전·근거리 이동은 기존 목록을 바꾸지 않고 1km 이상 이동만 구분한다", () => {
  const input = { ownerId: "owner", cycle: 0, conditionsKey: inputFingerprint, location: nearby, region };
  assert.equal(reusableRecommendation(snapshot, input), snapshot);
  assert.equal(reusableRecommendation(snapshot, { ...input, location: far }), undefined);
  assert.equal(hasMovedRecommendationOrigin(anchor, { ...far, accuracy: 5_000 }), false, "낮은 정확도는 이동 증거가 아니다");
  assert.equal(reusableRecommendation(snapshot, { ...input, location: undefined }), snapshot, "위치 복원 중에도 목록 유지");
  assert.equal(reusableRecommendation(snapshot, { ...input, ownerId: "other" }), undefined);
  assert.equal(reusableRecommendation(snapshot, { ...input, cycle: 1 }), undefined);
  assert.equal(reusableRecommendation(snapshot, { ...input, conditionsKey: "changed" }), undefined);
});

test("위치 미제공 지역 추천에는 시간 만료가 없고 조건·지역·재추천 의도로만 교체한다", () => {
  const selected = { ...snapshot, locationAnchor: undefined };
  const input = { ownerId: "owner", cycle: 0, conditionsKey: inputFingerprint, region };
  assert.equal(reusableRecommendation(selected, input), selected);
  assert.equal(reusableRecommendation(selected, { ...input, region: { ...region, sigunguName: "강남구" } }), undefined);
  assert.equal(reusableRecommendation(selected, { ...input, cycle: 1 }), undefined);
  assert.equal(reusableRecommendation(selected, { ...input, conditionsKey: "changed" }), undefined);
});

test("기준점은 편의점 왕복에도 유지하며 실제 이동·철회·계정 초기화 시 저장소에서도 제거한다", () => {
  reset();
  let serialized = "";
  useTutiStore.persist.setOptions({ storage: createJSONStorage(() => ({ getItem: () => null, setItem: (_key, value) => { serialized = value; }, removeItem() {} })) });
  useTutiStore.setState({ dailyRecommendation: snapshot, activeIndex: 2, activePlaceId: "third" });
  useTutiStore.getState().setUserLocation(nearby);
  assert.deepEqual(useTutiStore.getState().dailyRecommendation?.locationAnchor, anchor);
  assert.equal(useTutiStore.getState().activePlaceId, "third");
  useTutiStore.getState().setUserLocation(far);
  assert.equal(useTutiStore.getState().dailyRecommendation, undefined);
  assert.equal(useTutiStore.getState().recommendationCycle, 1);
  assert.equal(useTutiStore.getState().activePlaceId, undefined);
  assert.doesNotMatch(serialized, /locationAnchor/);
  useTutiStore.setState({ dailyRecommendation: snapshot });
  useTutiStore.getState().withdrawLocationConsent();
  assert.doesNotMatch(serialized, /locationAnchor|original/);
  useTutiStore.getState().setRecommendationDogOuting("owner", { weightsKg: [], leash: null, carrier: null, space: "indoor" });
  assert.equal(useTutiStore.getState().recommendationDogOuting?.ownerId, "owner");
  useTutiStore.getState().resetAllData();
  assert.equal(useTutiStore.getState().recommendationDogOuting, undefined);
});

test("실제 훅과 QueryObserver: 작성 왕복·새 QueryClient 복원은 요청 0회, 조건 변경·수동 재추천만 요청", async () => {
  reset();
  let owner = "owner", requests = 0;
  const clients: QueryClient[] = [];
  function client() { const value = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(value); return value; }
  function mount(queryClient: QueryClient) {
    let observer: QueryObserver | undefined;
    const flow = clientFlowHarness("src/features/tuti/hooks/useTutiRecommendations.ts", "useTutiRecommendations", {
      "@tanstack/react-query": { useQuery: (options: QueryObserverOptions) => {
        observer = new QueryObserver(queryClient, { ...options, gcTime: 0 }); // 시험 프로세스에는 장시간 GC 타이머를 남기지 않는다.
        return observer.getCurrentResult();
      } },
      "@/features/tuti/recommendationSnapshot": snapshotPolicy,
      "@/lib/tutiApi": { fetchRecommendations: async () => { requests++; return { recommendationId: `run-${requests}`, algorithmVersion: "test", places: [] }; } },
      "@/lib/auth/session": { isSessionCurrent: (session: { userId: string }) => session.userId === owner },
      "@/shared/location/terms": { getLocationTermsVersion },
      "@/lib/recommendations": { interpretState },
      "@/shared/location/recommendationArea": { hasRecommendationArea },
      "@/lib/intakePreferences": { withDefaultIntakeAnswers },
      "@/store/tuti": { useTutiStore: Object.assign((select: (state: ReturnType<typeof useTutiStore.getState>) => unknown) => select(useTutiStore.getState()), { getState: useTutiStore.getState }) },
      "./useSession": { useSession: () => ({ userId: owner }) },
    });
    flow.render();
    const stop = observer!.subscribe(() => {});
    return { observer: observer!, effects: () => flow.effects(), stop: () => { stop(); flow.dispose(); } };
  }
  try {
    const first = mount(client());
    await first.observer.refetch();
    assert.equal(requests, 1);
    first.stop();
    assert.equal(useTutiStore.getState().dailyRecommendation?.recommendationId, "run-1");
    useTutiStore.getState().setUserLocation(nearby);
    useTutiStore.setState({ activePlaceId: "kept-card" });
    const returned = mount(client()); // 브라우저 새로고침처럼 QueryClient 메모리도 새로 만든다.
    assert.equal((returned.observer.getCurrentResult().data as { recommendationId: string })?.recommendationId, "run-1");
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(requests, 1);
    assert.equal(useTutiStore.getState().activePlaceId, "kept-card");
    returned.stop();
    useTutiStore.getState().setAnswer("transport", "car");
    const changed = mount(client());
    await changed.observer.refetch();
    assert.equal(requests, 2);
    changed.stop();
    useTutiStore.getState().refreshDailyRecommendation();
    const manual = mount(client());
    await manual.observer.refetch();
    assert.equal(requests, 3);
    manual.stop();
    owner = "other";
    const switched = mount(client());
    assert.equal(switched.observer.getCurrentResult().data, undefined, "다른 계정의 저장 목록을 노출하지 않는다");
    await switched.observer.refetch();
    switched.stop();

    reset();
    useTutiStore.getState().setPreferredRegion(region);
    useTutiStore.getState().syncLocationConsent(undefined);
    const regional = mount(client());
    await regional.observer.refetch();
    regional.stop();
    const afterRegionRequest = requests;
    useTutiStore.getState().syncLocationConsent(undefined);
    const regionalReturn = mount(client());
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(requests, afterRegionRequest, "위치 미제공 사용자도 새 실행에서 재조회하지 않는다");
    // 렌더 이후 철회된 경우 예약된 캐시 저장 effect도 목록을 복구하면 안 된다.
    useTutiStore.getState().withdrawLocationConsent();
    regionalReturn.effects();
    assert.equal(useTutiStore.getState().dailyRecommendation, undefined);
    regionalReturn.stop();

    useTutiStore.getState().setAnswer("transport", "transit");
    const late = mount(client());
    const pending = late.observer.refetch();
    useTutiStore.getState().withdrawLocationConsent();
    await pending;
    assert.equal(useTutiStore.getState().dailyRecommendation, undefined, "이전 추천 세대의 늦은 서버 응답은 저장하지 않는다");
    late.stop();
  } finally { clients.forEach(value => value.clear()); }
});

test("자동 갱신 이벤트는 재추천을 하지 않고 비동의 지역 모드의 버튼은 위치 권한을 요청하지 않는다", () => {
  const hook = readFileSync("src/features/tuti/hooks/useTutiRecommendations.ts", "utf8");
  assert.match(hook, /staleTime: Infinity/);
  for (const event of ["refetchOnMount", "refetchOnWindowFocus", "refetchOnReconnect"]) assert.ok(hook.includes(`${event}: false`));
  assert.doesNotMatch(hook, /getKoreanDateKey/);
  const flow = readFileSync("src/features/tuti/flows/RecommendationsFlow.tsx", "utf8");
  const manual = flow.slice(flow.indexOf("const recommendFromCurrentLocation"), flow.indexOf("return (", flow.indexOf("const recommendFromCurrentLocation")));
  assert.match(manual, /regionMode \? undefined : await refreshDeviceLocation\(\)/);
  assert.doesNotMatch(manual, /await requestLocation\(/);
  const provider = readFileSync("src/features/tuti/location/LocationAccessProvider.tsx", "utf8");
  assert.match(provider, /const confirmation = await requestDeviceLocation\(\{ maximumAge: 0 \}\)/);
});

test("위치 미제공 사용자의 동의 재조회는 지역 추천·보던 카드를 지우지 않는다", () => {
  reset();
  useTutiStore.getState().setPreferredRegion(region);
  useTutiStore.setState({ dailyRecommendation: { ...snapshot, locationAnchor: undefined }, activePlaceId: "third", activeIndex: 2 });
  for (const consent of [undefined, { status: "declined" as const, termsVersion: getLocationTermsVersion(), updatedAt: "2026-11-17T00:00:00Z" }]) {
    useTutiStore.getState().syncLocationConsent(consent);
    assert.equal(useTutiStore.getState().dailyRecommendation?.recommendationId, "original");
    assert.equal(useTutiStore.getState().activePlaceId, "third");
    assert.equal(useTutiStore.getState().activeIndex, 2);
  }
  useTutiStore.setState({ recommendationLocationSource: undefined });
  useTutiStore.getState().syncLocationConsent(undefined);
  assert.equal(useTutiStore.getState().dailyRecommendation?.recommendationId, "original", "구 저장소에 선택 출처 플래그가 없어도 지역 목록을 보존한다");
});

test("실제 조용한 위치 확인은 지역 모드에서 조회하지 않고 실패·불일치 측정에는 목록을 보존한다", async () => {
  const source = readFileSync("src/features/tuti/location/LocationAccessProvider.tsx", "utf8");
  const start = source.indexOf("const refreshDeviceLocation = useCallback(") + "const refreshDeviceLocation = useCallback(".length;
  const expression = source.slice(start, source.indexOf("\n  }, [setUserLocation, syncLocationConsent]);", start)) + "\n}";
  const compiled = ts.transpileModule(`const run = ${expression};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  reset();
  let requests = 0;
  let results: Array<{ status: "ready"; location: typeof anchor } | { status: "timeout" }> = [];
  const bindings = {
    quietLocationRequest: { current: null }, requestPromiseRef: { current: null },
    deviceRequestGeneration: { current: 0 }, consentSyncGeneration: { current: 0 },
    useTutiStore, getSessionSnapshot: () => ({ userId: "owner" }), isSessionCurrent: () => true,
    getLocationTermsVersion, readLocationPermission: async () => "granted",
    fetchLocationConsent: async () => useTutiStore.getState().locationConsent,
    syncLocationConsent: useTutiStore.getState().syncLocationConsent,
    setUserLocation: useTutiStore.getState().setUserLocation,
    requestDeviceLocation: async () => { requests++; return results.shift() ?? { status: "timeout" }; },
    hasMovedRecommendationOrigin, distanceMeters: snapshotPolicy.distanceMeters,
  };
  const run = new Function(...Object.keys(bindings), `${compiled}; return run;`)(...Object.values(bindings)) as () => Promise<unknown>;
  useTutiStore.getState().setPreferredRegion(region);
  await run();
  assert.equal(requests, 0, "지역 모드에서는 기기 위치를 수집하지 않는다");
  useTutiStore.setState({ recommendationLocationSource: "device", userLocation: anchor, dailyRecommendation: snapshot });
  results = [{ status: "timeout" }];
  await run();
  assert.equal(useTutiStore.getState().dailyRecommendation?.recommendationId, "original");
  results = [{ status: "ready", location: far }, { status: "ready", location: nearby }];
  await run();
  assert.equal(useTutiStore.getState().dailyRecommendation?.recommendationId, "original", "멀리 튄 단일 측정은 무시한다");
  results = [{ status: "ready", location: far }, { status: "ready", location: far }];
  await run();
  assert.equal(useTutiStore.getState().dailyRecommendation, undefined);
  assert.deepEqual(useTutiStore.getState().userLocation, far);
  assert.equal(useTutiStore.getState().recommendationCycle, 1);
});
