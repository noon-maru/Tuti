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

function routes(
  statuses: Partial<Record<DepartureRouteMode, DepartureRoute["status"]>>,
): DeparturePlan["routes"] {
  return {
    publicTransit: route(
      "publicTransit",
      statuses.publicTransit ?? "available",
    ),
    driving: route("driving", statuses.driving ?? "available"),
    bicycle: route("bicycle", statuses.bicycle ?? "available"),
    walking: route("walking", statuses.walking ?? "available"),
  };
}

test("경로를 확인한 이동수단만 목록에 표시한다", () => {
  assert.deepEqual(
    getVisibleDepartureRouteModes(routes({ walking: "unavailable" })),
    ["publicTransit", "driving", "bicycle"],
  );
  assert.deepEqual(
    getVisibleDepartureRouteModes(routes({
      driving: "unavailable",
      bicycle: "unavailable",
    })),
    ["publicTransit", "walking"],
  );
});
