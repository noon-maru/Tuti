import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { prepareRecommendationLocation } from "@/features/tuti/location/prepareRecommendationLocation";
import type { PreferredRegion, UserLocation } from "@/shared/tuti/types";

const region: PreferredRegion = {
  areaCode: "1", name: "서울", sigunguCode: "1", sigunguName: "종로구",
};
type Area = { userLocation?: UserLocation; preferredRegion?: PreferredRegion };

test("위치나 지역이 이미 준비됐다면 승인 절차를 반복하지 않는다", async () => {
  for (const area of [
    { userLocation: { latitude: 37.57, longitude: 126.98 } },
    { preferredRegion: region },
  ]) {
    await prepareRecommendationLocation(() => area, async () => {
      assert.fail("기존 추천 지역에 대해 위치 승인을 반복하면 안 됩니다.");
    });
  }
});

test("작은 여행 첫 진입 시 기기 위치 승인이 완료될 때까지 기다린다", async () => {
  const area: Area = {};
  let finished = false;
  let complete!: () => void;
  const permission = new Promise<void>((resolve) => { complete = resolve; });
  const preparation = prepareRecommendationLocation(() => area, async () => {
    await permission;
    area.userLocation = { latitude: 37.57, longitude: 126.98 };
  }).then(() => { finished = true; });
  await Promise.resolve();
  assert.equal(finished, false);
  complete();
  await preparation;
  assert.equal(finished, true);
});

test("권한 거부나 위치 조회 실패 후 지역 선택으로 추천을 준비한다", async () => {
  for (const status of ["denied", "timeout", "unavailable", "declined"]) {
    const area: Area = {};
    await prepareRecommendationLocation(() => area, async () => {
      area.preferredRegion = region;
      return { status };
    });
    assert.equal(area.preferredRegion, region);
  }
});

test("위치와 선택 지역이 없으면 작은 여행만 준비 실패로 처리한다", async () => {
  await assert.rejects(
    prepareRecommendationLocation(() => ({}), async () => ({ status: "timeout" })),
    /현재 위치를 확인하거나 추천받을 지역/,
  );
  await assert.rejects(
    prepareRecommendationLocation(() => ({}), async () => { throw new Error("연결 오류"); }),
    /연결 오류/,
  );
});

test("로그인 완료는 위치 요청 없이 홈으로 가고 작은 여행에서만 지역을 준비한다", () => {
  const account = readFileSync("src/features/tuti/flows/AccountFlow.tsx", "utf8");
  assert.doesNotMatch(account, /requestLocation|refreshLocationConsent|prepareRecommendationLocation|useLocationAccess/);
  assert.match(account, /router.replace\(await pendingHarumadiInvite\(true\).*\? "\/harumadi\/invite" : "\/"\)/);
  const explore = readFileSync("src/features/tuti/flows/ExploreFlow.tsx", "utf8");
  assert.match(explore, /<ExploreLocationGate key=\{ownerId\}>/);
  const gate = readFileSync("src/features/tuti/location/ExploreLocationGate.tsx", "utf8");
  assert.match(gate, /prepareRecommendationLocation\(useTutiStore.getState, requestLocation\)/);
  assert.match(gate, /if \(state === "ready"\) return children/);
  assert.match(gate, /let active = true/);
  assert.match(gate, /active = false/);
  const intake = readFileSync("src/features/tuti/flows/IntakeFlow.tsx", "utf8");
  assert.equal(intake.match(/await prepareRecommendationLocation\(useTutiStore.getState, requestLocation\)/g)?.length, 2);
  assert.doesNotMatch(intake, /await requestLocation\(\)/);
});

test("기기 위치는 서버에서 현재 약관 동의를 확인한 후에만 요청한다", () => {
  const provider = readFileSync("src/features/tuti/location/LocationAccessProvider.tsx", "utf8");
  const request = provider.slice(provider.indexOf("const requestLocation = useCallback"), provider.indexOf("const requestRegionPreference"));
  assert.match(request, /fetchLocationConsent\(\)/);
  assert.match(request, /serverConsent\?\.status === "accepted"/);
  assert.match(request, /canUseLocationWithoutConsentPrompt\(consent\)/);
  assert.match(request, /if \(acceptedOnServer\) return resolveDeviceLocation\(\)/);
  assert.match(request, /setConsentSheetOpen\(true\)/);
});
