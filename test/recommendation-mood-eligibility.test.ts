import assert from "node:assert/strict";
import test from "node:test";
import type { CrowdForecast } from "../src/lib/recommendations";
import {
  filterPlacesByRequestedDensity,
  filterPlacesByRequestedMood,
} from "../src/server/recommendations/moodEligibility";

const places = [
  { id: "quiet", moodTags: ["quiet"] },
  { id: "open", moodTags: ["open", "walk"] },
  { id: "unknown", moodTags: [] },
];

test("원하는 분위기가 확인된 장소만 추천 후보로 남긴다", () => {
  assert.deepEqual(
    filterPlacesByRequestedMood(places, "open").map(({ id }) => id),
    ["open"],
  );
  assert.deepEqual(
    filterPlacesByRequestedMood(places, "quiet").map(({ id }) => id),
    ["quiet"],
  );
});

test("분위기를 고르지 않았다면 후보를 줄이지 않는다", () => {
  assert.deepEqual(filterPlacesByRequestedMood(places, undefined), places);
});

test("한적한 분위기에서는 혼잡 예측이 높은 장소를 제외한다", () => {
  const forecasted: Array<{
    id: string;
    crowd: string;
    crowdForecast?: CrowdForecast;
  }> = [
    { id: "low", crowd: "낮음", crowdForecast: { level: "low", source: "forecast", rate: 20 } },
    { id: "high", crowd: "높음", crowdForecast: { level: "high", source: "forecast", rate: 90 } },
    { id: "legacy-high", crowd: "혼잡", crowdForecast: undefined },
  ];

  assert.deepEqual(
    filterPlacesByRequestedDensity(forecasted, "quiet").map(({ id }) => id),
    ["low"],
  );
  assert.deepEqual(filterPlacesByRequestedDensity(forecasted, "lively"), forecasted);
});
