import { createHash } from "node:crypto";
import { ExpiringCache } from "@/server/cache/expiringCache";
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

const routeCache = new ExpiringCache<string, Promise<DepartureRoute>>(MAX_ROUTE_CACHE_ENTRIES);

export function fetchCachedRoute(
  mode: DepartureRouteMode,
  input: RouteInput,
) {
  const key = createRouteCacheKey(mode, input.origin, input.destination);
  const cached = routeCache.get(key);
  if (cached) return cached;

  const route = (mode === "driving"
    ? fetchKakaoDrivingRoute(input)
    : fetchKakaoMapRoute(mode, input)
  ).catch((error) => {
    // 과거 요청의 지연 실패가 같은 키의 새 요청까지 지우지 않도록 한다.
    routeCache.deleteIfValue(key, route);
    throw error;
  });
  routeCache.set(key, route, ROUTE_CACHE_TTL_MS);
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
