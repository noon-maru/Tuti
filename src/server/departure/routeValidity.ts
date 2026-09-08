import { calculateDistanceMeters } from "@/server/departure/routeSelection";
import type { DepartureRoute } from "@/shared/api/departurePlan";
import type { UserLocation } from "@/shared/tuti/types";

const SAME_LOCATION_TOLERANCE_METERS = 1;

export type RouteEndpoints = {
  origin: UserLocation;
  destination: UserLocation;
};

export function parseRouteMetric(value: unknown): number | null {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    (typeof value === "string" && value.trim() === "")
  ) {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function isUsableRoute(
  route: DepartureRoute | null,
  endpoints?: RouteEndpoints,
): route is DepartureRoute & {
  durationSeconds: number;
  distanceMeters: number;
} {
  if (
    !route ||
    route.status !== "available" ||
    route.durationSeconds === null ||
    route.distanceMeters === null ||
    !Number.isFinite(route.durationSeconds) ||
    !Number.isFinite(route.distanceMeters) ||
    route.durationSeconds < 0 ||
    route.distanceMeters < 0
  ) {
    return false;
  }

  const sameLocation = endpoints
    ? calculateDistanceMeters(endpoints.origin, endpoints.destination) <=
      SAME_LOCATION_TOLERANCE_METERS
    : false;

  if (sameLocation) {
    return route.durationSeconds === 0 && route.distanceMeters === 0
      ? true
      : route.durationSeconds > 0 && route.distanceMeters > 0;
  }

  return route.durationSeconds > 0 && route.distanceMeters > 0;
}
