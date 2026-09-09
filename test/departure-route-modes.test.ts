import assert from "node:assert/strict";
import test from "node:test";
import { getVisibleDepartureRouteModes } from "@/features/tuti/lib/departureRouteModes";
import type {
  DeparturePlan,
  DepartureRoute,
  DepartureRouteMode,
} from "@/shared/api/departurePlan";

function route(
  mode: DepartureRouteMode,
  status: DepartureRoute["status"],
): DepartureRoute {
  return {
    mode,
    status,
    durationSeconds: status === "available" ? 600 : null,
    distanceMeters: status === "available" ? 1_000 : null,
    transfers: null,
    fareWon: null,
    tollWon: null,
    taxiFareWon: null,
    externalUrl: null,
    steps: [],
  };
}

function routes(walkingStatus: DepartureRoute["status"]): DeparturePlan["routes"] {
  return {
    publicTransit: route("publicTransit", "available"),
    driving: route("driving", "available"),
    bicycle: route("bicycle", "available"),
    walking: route("walking", walkingStatus),
  };
}

test("도보 경로가 없으면 이동수단 목록에서 도보를 숨긴다", () => {
  assert.deepEqual(getVisibleDepartureRouteModes(routes("unavailable")), [
    "publicTransit",
    "driving",
    "bicycle",
  ]);
  assert.deepEqual(getVisibleDepartureRouteModes(routes("available")), [
    "publicTransit",
    "driving",
    "bicycle",
    "walking",
  ]);
});
