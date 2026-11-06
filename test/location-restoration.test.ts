import assert from "node:assert/strict";
import test from "node:test";
import { createJSONStorage } from "zustand/middleware";
import { readFileSync } from "node:fs";
import { useTutiStore } from "@/store/tuti";
import { getLocationTermsVersion } from "@/shared/location/terms";
import { isRecommendationLocationReady, needsRecommendationRegionChoice, prepareRecommendationLocation, shouldRestoreDeviceLocation } from "@/features/tuti/location/prepareRecommendationLocation";

const region = { areaCode: "1", name: "서울", sigunguCode: "1", sigunguName: "종로구" };
const accepted = { status: "accepted" as const, termsVersion: getLocationTermsVersion(), updatedAt: "2026-11-06T00:00:00Z" };
let stored = "";
function reset() {
  useTutiStore.persist.setOptions({ storage: createJSONStorage(() => ({ getItem: () => null, setItem: (_key, value) => { stored = value; }, removeItem() {} })) });
  useTutiStore.getState().resetAllData();
  useTutiStore.setState({ locationConsent: accepted, preferredRegion: region });
}

test("현재 위치 선택은 저장된 지역이 있어도 좌표를 다시 확보한다", async () => {
  reset();
  assert.equal(shouldRestoreDeviceLocation(useTutiStore.getState()), true, "기존 저장소에 선택 값이 없어도 동의한 현재 위치를 복원한다");
  let requests = 0;
  await prepareRecommendationLocation(useTutiStore.getState, async () => {
    requests++;
    useTutiStore.getState().setUserLocation({ latitude: 37.57, longitude: 126.98 });
  });
  assert.equal(requests, 1);
  assert.equal(isRecommendationLocationReady(useTutiStore.getState()), true);
  const persisted = JSON.parse(stored).state;
  assert.equal(persisted.recommendationLocationSource, "device");
  assert.equal(persisted.userLocation, undefined, "좌표 자체는 영구 저장하지 않는다");
  useTutiStore.getState().clearUserLocation();
  assert.equal(isRecommendationLocationReady(useTutiStore.getState()), false, "좌표 소실을 준비 완료로 유지하지 않는다");
});

test("직접 고른 지역·위치 실패 후 고른 지역은 자동으로 현재 위치로 바꾸지 않는다", async () => {
  reset();
  useTutiStore.getState().setUserLocation({ latitude: 37, longitude: 127 });
  useTutiStore.getState().setPreferredRegion(region);
  assert.equal(useTutiStore.getState().userLocation, undefined);
  assert.equal(JSON.parse(stored).state.recommendationLocationSource, "region");
  assert.equal(isRecommendationLocationReady(useTutiStore.getState()), true);
  await prepareRecommendationLocation(useTutiStore.getState, async () => { assert.fail("수동 지역 선택을 존중한다"); });
  // 사용자가 다시 ‘현재 위치 사용’을 누른 뒤에는 좌표만 메모리에서 복원한다.
  useTutiStore.getState().setUserLocation({ latitude: 37, longitude: 127 });
  useTutiStore.getState().clearUserLocation();
  assert.equal(shouldRestoreDeviceLocation(useTutiStore.getState()), true);
});

test("철회·거절·일시 중지는 자동 재개하지 않고 지역 선택으로 남긴다", async () => {
  for (const status of ["paused", "withdrawn", "declined"] as const) {
    const area = { locationConsent: { ...accepted, status }, preferredRegion: region };
    assert.equal(shouldRestoreDeviceLocation(area), false);
    await prepareRecommendationLocation(() => area, async () => { assert.fail("자동 위치 재개 금지"); });
    const withoutRegion = { locationConsent: { ...accepted, status } };
    assert.equal(needsRecommendationRegionChoice(withoutRegion), true);
    await assert.rejects(prepareRecommendationLocation(() => withoutRegion, async () => { assert.fail("자동 재동의·재개 금지"); }), /지역을 선택/);
  }
});

test("오래된 지역만 남고 좌표 복원이 실패하면 준비 완료로 처리하지 않는다", async () => {
  const area = { locationConsent: accepted, preferredRegion: region, recommendationLocationSource: "device" as const };
  await assert.rejects(prepareRecommendationLocation(() => area, async () => {}), /현재 위치/);
});

test("작은 여행은 위치 준비 변화에 반응하고 철회·지역 선택 중에는 새 요청을 시작하지 않는다", () => {
  const source = readFileSync("src/features/tuti/location/ExploreLocationGate.tsx", "utf8");
  assert.match(source, /useTutiStore\(isRecommendationLocationReady\)/);
  assert.match(source, /if \(!hasHydrated \|\| resolvingLocation\) return/);
  assert.match(source, /state === "ready" && prepared/);
  assert.match(source, /requestRegionPreference\(\)/);
  const provider = readFileSync("src/features/tuti/location/LocationAccessProvider.tsx", "utf8");
  assert.match(provider, /resolvingLocation: requesting \|\| consentSheetOpen \|\| regionSheetOpen \|\| locationFailure !== null/);
  const regionChoice = provider.slice(provider.indexOf("const completeRegionPreference"), provider.indexOf("const agreeAndRequest"));
  assert.match(regionChoice, /deviceRequestGeneration.current \+= 1/);
  assert.match(regionChoice, /consentSyncGeneration.current \+= 1/);
  assert.match(regionChoice, /finishRequest\(result\)/);
});
