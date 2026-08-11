import assert from "node:assert/strict";
import test from "node:test";
import { getRecommendationStatus } from "@/features/tuti/lib/recommendationStatus";
import { selectRecommendationCandidatePool } from "@/server/recommendations/candidateFallback";
import { getPreferredRegionWhere } from "@/server/recommendations/regionFallback";

test("일반 지역은 선택한 시도명으로 조회한다", () => {
  assert.deepEqual(
    getPreferredRegionWhere({ areaCode: "1", name: "서울특별시" }),
    { sourceSidoName: "서울특별시" },
  );
});

test("광주는 통합 지역 중 5개 자치구를 대체 경로로 포함한다", () => {
  const where = getPreferredRegionWhere({
    areaCode: "5",
    name: "광주광역시",
  });

  assert.deepEqual(where, {
    OR: [
      { sourceSidoName: "광주광역시" },
      {
        sourceSidoName: "전남광주통합특별시",
        sourceSigunguName: {
          in: ["광산구", "남구", "동구", "북구", "서구"],
        },
      },
    ],
  });
});

test("전남은 통합 지역에서 광주 5개 자치구를 제외한다", () => {
  const where = getPreferredRegionWhere({
    areaCode: "38",
    name: "전라남도",
  });

  assert.deepEqual(where, {
    OR: [
      { sourceSidoName: "전라남도" },
      {
        sourceSidoName: "전남광주통합특별시",
        NOT: {
          sourceSigunguName: {
            in: ["광산구", "남구", "동구", "북구", "서구"],
          },
        },
      },
    ],
  });
});

test("제외 후 후보가 6개 미만이면 원래 후보를 복구한다", () => {
  const places = Array.from({ length: 6 }, (_, index) => ({
    id: `place-${index + 1}`,
  }));
  const selection = selectRecommendationCandidatePool(
    places,
    ["place-1"],
  );

  assert.equal(selection.eligiblePlaces.length, 5);
  assert.deepEqual(selection.candidatePlaces, places);
});

test("원천 후보가 비어 있으면 빈 결과를 그대로 유지한다", () => {
  const selection = selectRecommendationCandidatePool([], ["place-1"]);

  assert.deepEqual(selection.eligiblePlaces, []);
  assert.deepEqual(selection.candidatePlaces, []);
  assert.equal(
    getRecommendationStatus({
      loading: false,
      recommendationError: false,
      placeCount: selection.candidatePlaces.length,
    }),
    "empty",
  );
});

test("로딩·오류·정상 결과 상태가 빈 결과보다 우선한다", () => {
  assert.equal(
    getRecommendationStatus({
      loading: true,
      recommendationError: false,
      placeCount: 0,
    }),
    "loading",
  );
  assert.equal(
    getRecommendationStatus({
      loading: false,
      recommendationError: true,
      placeCount: 0,
    }),
    "error",
  );
  assert.equal(
    getRecommendationStatus({
      loading: false,
      recommendationError: false,
      placeCount: 1,
    }),
    "ready",
  );
});
