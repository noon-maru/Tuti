import assert from "node:assert/strict";
import test from "node:test";
import { hasRecommendationArea } from "@/server/recommendations/recommendationArea";

test("현재 위치가 없으면 시군구 선택이 필요하다", () => {
  assert.equal(hasRecommendationArea(undefined, undefined), false);
  assert.equal(
    hasRecommendationArea(undefined, {
      areaCode: "1",
      name: "서울특별시",
      sigunguCode: "110",
      sigunguName: "종로구",
    }),
    true,
  );
});

test("현재 위치가 있으면 별도 지역 선택 없이 추천할 수 있다", () => {
  assert.equal(
    hasRecommendationArea(
      { latitude: 37.5264, longitude: 126.8962 },
      undefined,
    ),
    true,
  );
});
