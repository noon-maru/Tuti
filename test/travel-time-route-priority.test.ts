import assert from "node:assert/strict";
import test from "node:test";
import { getTravelTimeRoutePriority } from "@/server/departure/travelTimeRoutePriority";

test("자동차를 선택한 추천 카드는 자동차 경로만 조회한다", () => {
  assert.deepEqual(getTravelTimeRoutePriority("car", true), ["driving"]);
  assert.deepEqual(getTravelTimeRoutePriority("car", false), ["driving"]);
});

test("대중교통 추천 카드는 가까우면 도보를 먼저 확인한다", () => {
  assert.deepEqual(getTravelTimeRoutePriority("transit", true), [
    "walking",
    "publicTransit",
    "driving",
    "bicycle",
  ]);
  assert.deepEqual(getTravelTimeRoutePriority("transit", false), [
    "publicTransit",
    "driving",
    "bicycle",
  ]);
});
