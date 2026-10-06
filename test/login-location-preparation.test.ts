import assert from "node:assert/strict";
import test from "node:test";
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

test("처음 계정을 불러올 때 기기 위치 승인이 완료될 때까지 기다린다", async () => {
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

test("위치와 선택 지역이 없는 상태에서는 로그인 후 메인 진입을 허용하지 않는다", async () => {
  await assert.rejects(
    prepareRecommendationLocation(() => ({}), async () => ({ status: "timeout" })),
    /현재 위치를 확인하거나 추천받을 지역/,
  );
  await assert.rejects(
    prepareRecommendationLocation(() => ({}), async () => { throw new Error("연결 오류"); }),
    /연결 오류/,
  );
});
