import { createHash } from "node:crypto";
import { fetchKakaoMapRoute } from "@/server/maps/kakaoMapClient";
import { fetchKakaoDrivingRoute } from "@/server/maps/kakaoNaviClient";
import type {
  DepartureRoute,
  DepartureRouteMode,
} from "@/shared/api/departurePlan";
import type { UserLocation } from "@/shared/tuti/types";

const ROUTE_CACHE_TTL_MS = 5 * 60 * 1_000;
const MAX_ROUTE_CACHE_ENTRIES = 500;

type RouteInput = {
  origin: UserLocation;
  destination: UserLocation;
  destinationName: string;
};

const routeCache = new Map<
  string,
  { expiresAt: number; route: Promise<DepartureRoute> }
>();

export function fetchCachedRoute(
  mode: DepartureRouteMode,
  input: RouteInput,
) {
  const key = createRouteCacheKey(mode, input.origin, input.destination);
  const cached = routeCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.route;
  if (cached) routeCache.delete(key);

  const route = (mode === "driving"
    ? fetchKakaoDrivingRoute(input)
    : fetchKakaoMapRoute(mode, input)
  ).catch((error) => {
    routeCache.delete(key);
    throw error;
  });
  routeCache.set(key, {
    expiresAt: Date.now() + ROUTE_CACHE_TTL_MS,
    route,
  });
  trimRouteCache();
  return route;
}

function createRouteCacheKey(
  mode: DepartureRouteMode,
  origin: UserLocation,
  destination: UserLocation,
) {
  const location = [origin, destination]
    .map(({ latitude, longitude }) =>
      `${latitude.toFixed(4)},${longitude.toFixed(4)}`)
    .join("|");
  return createHash("sha256").update(`${mode}:${location}`).digest("hex");
}

function trimRouteCache() {
  const now = Date.now();
  for (const [key, value] of routeCache) {
    if (value.expiresAt <= now) routeCache.delete(key);
  }
  while (routeCache.size > MAX_ROUTE_CACHE_ENTRIES) {
    const oldestKey = routeCache.keys().next().value;
    if (typeof oldestKey !== "string") break;
    routeCache.delete(oldestKey);
  }
}
