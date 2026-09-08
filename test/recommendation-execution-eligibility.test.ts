import assert from "node:assert/strict";
import test from "node:test";
import type { TutiPlace } from "../src/lib/recommendations";
import { excludeExplicitlyInfeasiblePlaces } from "../src/server/recommendations/executionEligibility";

function place(
  id: string,
  feasibility?: TutiPlace["executionFeasibility"],
): TutiPlace {
  return {
    id,
    name: id,
    phrase: "",
    note: "",
    image: "",
    travelTime: "",
    crowd: "",
    today: "",
    fatigue: 0,
    movementLevel: "short",
    moodTags: [],
    ...(feasibility ? { executionFeasibility: feasibility } : {}),
  };
}

function feasibility(
  fitsAvailableTime: boolean,
  operationStatus: NonNullable<
    TutiPlace["executionFeasibility"]
  >["operationStatus"],
): NonNullable<TutiPlace["executionFeasibility"]> {
  return {
    availableMinutes: 60,
    oneWayMinutes: 20,
    roundTripMinutes: 40,
    minimumStayMinutes: 40,
    waitingMinutes: 0,
    totalMinutes: 80,
    fitsAvailableTime,
    operationStatus,
    arrivalAt: "2026-09-08T12:20:00.000Z",
    leaveAt: "2026-09-08T13:00:00.000Z",
    returnAt: "2026-09-08T13:20:00.000Z",
  };
}

test("명시적으로 시간 내 실행 불가능한 후보만 최종 추천에서 제외한다", () => {
  const candidates = [
    place("available", feasibility(true, "available")),
    place("route-unknown"),
    place("operation-unknown", feasibility(true, "unknown")),
    place("time-over", feasibility(false, "unknown")),
    place("closed", feasibility(false, "closed_today")),
    place("closing", feasibility(false, "closes_too_soon")),
  ];

  assert.deepEqual(
    excludeExplicitlyInfeasiblePlaces(candidates).map(({ id }) => id),
    ["available", "route-unknown", "operation-unknown"],
  );
});

test("제외 후 후보가 부족해도 실행 불가능한 후보로 수를 채우지 않는다", () => {
  const candidates = [
    place("first", feasibility(true, "available")),
    place("closed", feasibility(false, "closed_today")),
    place("unknown"),
  ];

  const result = excludeExplicitlyInfeasiblePlaces(candidates);

  assert.equal(result.length, 2);
  assert.deepEqual(result.map(({ id }) => id), ["first", "unknown"]);
});
