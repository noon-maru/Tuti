import assert from "node:assert/strict";
import test from "node:test";
import {
  getRecommendationStatus,
  getRecommendationNoticeQueue,
  hasLimitedRecommendationResults,
} from "@/features/tuti/lib/recommendationStatus";
import { selectRecommendationCandidatePool } from "@/server/recommendations/candidateFallback";
import { collectEligibleCandidatesInBatches } from "@/server/recommendations/adaptiveCandidateEvaluation";
import { selectDiverseExperienceTypes } from "@/server/recommendations/diverseCandidateSelection";
import { getPreferredRegionWhere } from "@/server/recommendations/regionFallback";
import {
  LongDistanceRecommendationsUnavailableError,
  requireLocationForLongDistance,
  requireLongDistanceRecommendations,
  requireNearbyMovement,
} from "@/server/recommendations/longDistanceAvailability";

test("일반 지역은 선택한 시군구까지 좁혀 조회한다", () => {
  assert.deepEqual(
    getPreferredRegionWhere({
      areaCode: "1",
      name: "서울특별시",
      sigunguName: "종로구",
    }),
    { sourceSidoName: "서울특별시", sourceSigunguName: "종로구" },
  );
});

test("광주는 선택한 자치구만 통합 지역 대체 경로로 포함한다", () => {
  const where = getPreferredRegionWhere({
    areaCode: "5",
    name: "광주광역시",
    sigunguName: "광산구",
  });

  assert.deepEqual(where, {
    OR: [
      { sourceSidoName: "광주광역시", sourceSigunguName: "광산구" },
      {
        sourceSidoName: "전남광주통합특별시",
        sourceSigunguName: "광산구",
      },
    ],
  });
});

test("전남도 선택한 시군만 통합 지역 대체 경로로 포함한다", () => {
  const where = getPreferredRegionWhere({
    areaCode: "38",
    name: "전라남도",
    sigunguName: "순천시",
  });

  assert.deepEqual(where, {
    OR: [
      { sourceSidoName: "전라남도", sourceSigunguName: "순천시" },
      {
        sourceSidoName: "전남광주통합특별시",
        sourceSigunguName: "순천시",
      },
    ],
  });
});

test("세종은 단일 행정권역 전체를 조회한다", () => {
  assert.deepEqual(
    getPreferredRegionWhere({
      areaCode: "8",
      name: "세종특별자치시",
      sigunguName: "세종특별자치시",
    }),
    { sourceSidoName: "세종특별자치시" },
  );
});

test("직전 추천은 새 후보와 분리해 실행 가능성 검증 뒤 보충한다", () => {
  const places = Array.from({ length: 6 }, (_, index) => ({
    id: `place-${index + 1}`,
  }));
  const selection = selectRecommendationCandidatePool(
    places,
    ["place-1"],
  );

  assert.equal(selection.eligiblePlaces.length, 5);
  assert.deepEqual(selection.candidatePlaces, places.slice(1));
  assert.deepEqual(selection.fallbackPlaces, [places[0]]);
});

test("원천 후보가 비어 있으면 빈 결과를 그대로 유지한다", () => {
  const selection = selectRecommendationCandidatePool([], ["place-1"]);

  assert.deepEqual(selection.eligiblePlaces, []);
  assert.deepEqual(selection.candidatePlaces, []);
  assert.deepEqual(selection.fallbackPlaces, []);
  assert.equal(
    getRecommendationStatus({
      loading: false,
      recommendationError: false,
      placeCount: selection.candidatePlaces.length,
    }),
    "empty",
  );
});

test("장거리 여정이 없으면 근거리 후보로 대체하지 않고 재시도 오류를 낸다", () => {
  assert.throws(
    () => requireLongDistanceRecommendations([]),
    (error) =>
      error instanceof LongDistanceRecommendationsUnavailableError &&
      error.code === "long_distance_unavailable",
  );

  const places = [{ id: "long-distance-place" }];
  assert.equal(requireLongDistanceRecommendations(places), places);
  assert.throws(
    () => requireNearbyMovement("far"),
    LongDistanceRecommendationsUnavailableError,
  );
  assert.equal(requireNearbyMovement("half"), "half");
});

test("장거리 선택에는 선호 지역과 별개로 현재 위치가 필요하다", () => {
  assert.throws(
    () => requireLocationForLongDistance("far", undefined),
    (error) =>
      error instanceof LongDistanceRecommendationsUnavailableError &&
      error.code === "long_distance_location_required",
  );
  assert.doesNotThrow(() =>
    requireLocationForLongDistance("far", {
      latitude: 37.5665,
      longitude: 126.978,
    }),
  );
  assert.doesNotThrow(() =>
    requireLocationForLongDistance("half", undefined),
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

test("정상 결과가 1~5곳일 때만 조건 부족 안내를 표시한다", () => {
  assert.equal(
    hasLimitedRecommendationResults({
      loading: false,
      recommendationError: false,
      placeCount: 1,
    }),
    true,
  );
  assert.equal(
    hasLimitedRecommendationResults({
      loading: false,
      recommendationError: false,
      placeCount: 5,
    }),
    true,
  );

  for (const input of [
    { loading: false, recommendationError: false, placeCount: 0 },
    { loading: false, recommendationError: false, placeCount: 6 },
    { loading: true, recommendationError: false, placeCount: 3 },
    { loading: false, recommendationError: true, placeCount: 3 },
  ]) {
    assert.equal(hasLimitedRecommendationResults(input), false);
  }
});

test("결과 부족과 위치 권유가 겹치면 결과 부족을 먼저 안내한다", () => {
  assert.deepEqual(
    getRecommendationNoticeQueue({
      loading: false,
      recommendationError: false,
      placeCount: 4,
      locationAvailable: false,
    }),
    ["limited_results", "location_precision"],
  );
  assert.deepEqual(
    getRecommendationNoticeQueue({
      loading: false,
      recommendationError: false,
      placeCount: 6,
      locationAvailable: false,
    }),
    ["location_precision"],
  );
});

test("첫 후보에서 조건 충족 장소가 부족하면 평가하지 않은 다음 후보를 고른다", () => {
  const places = Array.from({ length: 24 }, (_, index) => ({
    id: `place-${index + 1}`,
    experienceType: String(Math.floor(index / 4)),
  }));
  const firstBatch = selectDiverseExperienceTypes(places, 12, 4);
  const evaluatedIds = new Set(firstBatch.map((place) => place.id));
  const supplementalBatch = selectDiverseExperienceTypes(
    places,
    12,
    4,
    evaluatedIds,
  );

  assert.equal(firstBatch.length, 12);
  assert.equal(supplementalBatch.length, 12);
  assert.equal(
    supplementalBatch.some((place) => evaluatedIds.has(place.id)),
    false,
  );
  assert.deepEqual(
    new Set([...firstBatch, ...supplementalBatch].map((place) => place.id)),
    new Set(places.map((place) => place.id)),
  );
});

test("첫 여섯 후보가 모두 실행 가능하면 경로 검증을 한 번만 수행한다", async () => {
  const places = Array.from({ length: 18 }, (_, index) => ({
    id: `place-${index + 1}`,
  }));
  let cursor = 0;
  const evaluatedBatchSizes: number[] = [];
  const eligible = await collectEligibleCandidatesInBatches({
    maximumBatchCount: 4,
    targetCount: 6,
    initialBatchSize: 6,
    supplementalBatchSize: 12,
    selectBatch: (batchSize) => {
      const batch = places.slice(cursor, cursor + batchSize);
      cursor += batch.length;
      return batch;
    },
    evaluateBatch: async (batch) => {
      evaluatedBatchSizes.push(batch.length);
      return batch;
    },
  });

  assert.equal(eligible.length, 6);
  assert.deepEqual(evaluatedBatchSizes, [6]);
});

test("최초 여섯 후보는 가능한 경우 세 가지 이상의 경험으로 구성한다", () => {
  const places = [
    ...Array.from({ length: 6 }, (_, index) => ({
      id: `park-${index + 1}`,
      experienceType: "park",
    })),
    ...Array.from({ length: 2 }, (_, index) => ({
      id: `museum-${index + 1}`,
      experienceType: "museum",
    })),
    ...Array.from({ length: 2 }, (_, index) => ({
      id: `library-${index + 1}`,
      experienceType: "library",
    })),
  ];
  const selected = selectDiverseExperienceTypes(places, 6, 2);

  assert.equal(selected.length, 6);
  assert.equal(new Set(selected.map((place) => place.experienceType)).size, 3);
  assert.equal(
    Math.max(
      ...Array.from(
        selected.reduce((counts, place) => {
          counts.set(
            place.experienceType,
            (counts.get(place.experienceType) ?? 0) + 1,
          );
          return counts;
        }, new Map<string, number>()).values(),
      ),
    ),
    2,
  );
});

test("첫 후보가 부족할 때만 다음 열두 후보를 추가 검증한다", async () => {
  const places = Array.from({ length: 18 }, (_, index) => ({
    id: `place-${index + 1}`,
  }));
  let cursor = 0;
  let evaluationCount = 0;
  const evaluatedBatchSizes: number[] = [];
  const eligible = await collectEligibleCandidatesInBatches({
    maximumBatchCount: 4,
    targetCount: 6,
    initialBatchSize: 6,
    supplementalBatchSize: 12,
    selectBatch: (batchSize) => {
      const batch = places.slice(cursor, cursor + batchSize);
      cursor += batch.length;
      return batch;
    },
    evaluateBatch: async (batch) => {
      evaluatedBatchSizes.push(batch.length);
      evaluationCount += 1;
      return evaluationCount === 1 ? batch.slice(0, 2) : batch;
    },
  });

  assert.equal(eligible.length, 14);
  assert.deepEqual(evaluatedBatchSizes, [6, 12]);
});
