import assert from "node:assert/strict";
import test from "node:test";
import {
  isUsableRoute,
  parseRouteMetric,
} from "../src/server/departure/routeValidity";
import { toTravelTimeSummary } from "../src/server/departure/travelTimeSummary";
import type { DepartureRoute } from "../src/shared/api/departurePlan";

const origin = { latitude: 33.4996, longitude: 126.5312 };
const destination = { latitude: 33.5063, longitude: 126.5312 };

function route(
  durationSeconds: number | null,
  distanceMeters: number | null,
): DepartureRoute {
  return {
    mode: "walking",
    status: "available",
    durationSeconds,
    distanceMeters,
    transfers: null,
    fareWon: null,
    tollWon: null,
    taxiFareWon: null,
    externalUrl: null,
    steps: [],
  };
}

test("카카오 경로 수치에서 null과 빈 값이 0으로 변환되지 않는다", () => {
  assert.equal(parseRouteMetric(null), null);
  assert.equal(parseRouteMetric(undefined), null);
  assert.equal(parseRouteMetric(""), null);
  assert.equal(parseRouteMetric("   "), null);
  assert.equal(parseRouteMetric(false), null);
  assert.equal(parseRouteMetric([]), null);
  assert.equal(parseRouteMetric(-1), null);
  assert.equal(parseRouteMetric("753"), 753);
});

test("서로 다른 좌표의 0초 또는 0m 경로는 추천 이동시간으로 쓰지 않는다", () => {
  const endpoints = { origin, destination };

  assert.equal(isUsableRoute(route(0, 0), endpoints), false);
  assert.equal(isUsableRoute(route(600, 0), endpoints), false);
  assert.equal(isUsableRoute(route(0, 753), endpoints), false);
  assert.equal(toTravelTimeSummary(route(0, 0), endpoints), null);
});

test("유효한 경로와 같은 위치의 0 이동 경로를 구분한다", () => {
  assert.equal(
    isUsableRoute(route(600, 753), { origin, destination }),
    true,
  );
  assert.equal(
    isUsableRoute(route(0, 0), { origin, destination: origin }),
    true,
  );
});
