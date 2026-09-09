import type {
  DeparturePlan,
  DepartureRouteMode,
} from "@/shared/api/departurePlan";

export const DEPARTURE_ROUTE_MODES: DepartureRouteMode[] = [
  "publicTransit",
  "driving",
  "bicycle",
  "walking",
];

export function getVisibleDepartureRouteModes(
  routes: DeparturePlan["routes"],
) {
  return DEPARTURE_ROUTE_MODES.filter(
    (mode) => mode !== "walking" || routes.walking.status === "available",
  );
}
