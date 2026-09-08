import assert from "node:assert/strict";
import test from "node:test";
import { departurePlanQueryKey } from "@/features/tuti/hooks/useDeparturePlan";
import { createRecommendationInputFingerprint } from "@/features/tuti/recommendationInputFingerprint";

const baseInput = {
  answers: {
    movement: "short" as const,
    air: "quiet" as const,
    density: "balanced" as const,
  },
  userLocation: { latitude: 37.5665, longitude: 126.978 },
  preferredRegion: { areaCode: "1", name: "서울특별시" },
  excludedPlaceIds: ["place-b", "place-a"],
  entryStatus: "answered" as const,
};

test("추천 입력 fingerprint는 같은 의미의 입력에 안정적이다", () => {
  const reordered = {
    ...baseInput,
    answers: {
      density: "balanced" as const,
      air: "quiet" as const,
      movement: "short" as const,
    },
    excludedPlaceIds: ["place-a", "place-b"],
  };

  const fingerprint = createRecommendationInputFingerprint(baseInput);

  assert.equal(fingerprint, createRecommendationInputFingerprint(reordered));
  assert.equal(fingerprint.includes("37.5665"), false);
  assert.equal(fingerprint.includes("서울특별시"), false);
});

test("추천 결과에 영향을 주는 입력이 바뀌면 fingerprint도 바뀐다", () => {
  const fingerprint = createRecommendationInputFingerprint(baseInput);
  const changedInputs = [
    { ...baseInput, answers: { ...baseInput.answers, air: "open" as const } },
    {
      ...baseInput,
      userLocation: { latitude: 35.8714, longitude: 128.6014 },
    },
    {
      ...baseInput,
      preferredRegion: { areaCode: "4", name: "대구광역시" },
    },
    { ...baseInput, excludedPlaceIds: ["place-c"] },
    { ...baseInput, entryStatus: "reused" as const },
  ];

  for (const input of changedInputs) {
    assert.notEqual(createRecommendationInputFingerprint(input), fingerprint);
  }
});

test("출발 계획 query key는 출발 좌표를 구분한다", () => {
  assert.notDeepEqual(
    departurePlanQueryKey("place-a", baseInput.userLocation),
    departurePlanQueryKey("place-a", {
      latitude: 35.8714,
      longitude: 128.6014,
    }),
  );
  assert.deepEqual(departurePlanQueryKey("place-a"), [
    "departure-plan",
    "place-a",
    null,
    null,
  ]);
});
