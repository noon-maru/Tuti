import assert from "node:assert/strict";
import test from "node:test";
import { filterPlacesByRequestedMood } from "../src/server/recommendations/moodEligibility";

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
