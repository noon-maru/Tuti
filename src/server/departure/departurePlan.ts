import { createHash } from "node:crypto";
import { prisma } from "@/server/db/prisma";
import {
  fetchKakaoMapRoute,
  fetchNearbyKakaoPlaces,
} from "@/server/maps/kakaoMapClient";
import { fetchKakaoDrivingRoute } from "@/server/maps/kakaoNaviClient";
import { ensureTourismPlaceDetail } from "@/server/tourism/enrichTourismPlaceDetail";
import type {
  DeparturePlan,
  DeparturePlanStep,
  DepartureRoute,
  DepartureRouteMode,
} from "@/shared/api/departurePlan";
import type { TourismPlaceDetail } from "@/shared/api/placeDetails";
import type { UserLocation } from "@/shared/tuti/types";

const ROUTE_CACHE_TTL_MS = 5 * 60 * 1_000;
const NEARBY_CACHE_TTL_MS = 6 * 60 * 60 * 1_000;
const MAX_MEMORY_CACHE_ENTRIES = 500;

type CachedValue<T> = {
  expiresAt: number;
  value: T;
};

type RouteBundle = DeparturePlan["routes"];

const routeCache = new Map<string, CachedValue<RouteBundle>>();
const nearbyCache = new Map<
  string,
  CachedValue<DeparturePlan["nearbyPlaces"]>
>();
const routeRequests = new Map<string, Promise<RouteBundle>>();
const nearbyRequests = new Map<
  string,
  Promise<DeparturePlan["nearbyPlaces"]>
>();

export async function createDeparturePlan(
  placeId: string,
  origin: UserLocation,
): Promise<DeparturePlan | null> {
  const place = await prisma.place.findFirst({
    where: {
      id: placeId,
      isActive: true,
      reviewStatus: "approved",
    },
    select: {
      id: true,
      name: true,
      sourceAddress: true,
      latitude: true,
      longitude: true,
    },
  });

  if (!place) return null;

  const destination = {
    latitude: Number(place.latitude),
    longitude: Number(place.longitude),
  };
  const [detail, routes, nearbyPlaces] = await Promise.all([
    getTourismDetail(place.id),
    getRouteBundle(origin, destination, place.name),
    getNearbyPlaces(destination, place.name),
  ]);
  const recommendedMode = selectRecommendedMode(routes);

  return {
    place: {
      id: place.id,
      name: place.name,
      address: place.sourceAddress,
      ...destination,
    },
    detail,
    routes,
    recommendedMode,
    nearbyPlaces,
    suggestedPlan: createSuggestedPlan(
      place.name,
      detail,
      routes,
      recommendedMode,
      nearbyPlaces,
    ),
    generatedAt: new Date().toISOString(),
  };
}

async function getTourismDetail(placeId: string) {
  try {
    return await ensureTourismPlaceDetail(placeId);
  } catch (error) {
    console.warn("출발 계획용 관광 상세정보를 불러오지 못했습니다.", {
      placeId,
      error: getErrorName(error),
    });
    return null;
  }
}

async function getRouteBundle(
  origin: UserLocation,
  destination: UserLocation,
  destinationName: string,
): Promise<RouteBundle> {
  const key = createLocationCacheKey("routes", origin, destination);
  const cached = readCache(routeCache, key);
  if (cached) return cached;

  const existingRequest = routeRequests.get(key);
  if (existingRequest) return existingRequest;

  const request = fetchRouteBundle(origin, destination, destinationName)
    .then((routes) => {
      writeCache(routeCache, key, routes, ROUTE_CACHE_TTL_MS);
      return routes;
    })
    .finally(() => routeRequests.delete(key));
  routeRequests.set(key, request);
  return request;
}

async function fetchRouteBundle(
  origin: UserLocation,
  destination: UserLocation,
  destinationName: string,
): Promise<RouteBundle> {
  const input = { origin, destination, destinationName };
  const [publicTransit, walking, bicycle, driving] = await Promise.all([
    settleRoute("publicTransit", () =>
      fetchKakaoMapRoute("publicTransit", input),
    ),
    settleRoute("walking", () => fetchKakaoMapRoute("walking", input)),
    settleRoute("bicycle", () => fetchKakaoMapRoute("bicycle", input)),
    settleRoute("driving", () => fetchKakaoDrivingRoute(input)),
  ]);

  return { publicTransit, walking, bicycle, driving };
}

async function settleRoute(
  mode: DepartureRouteMode,
  fetcher: () => Promise<DepartureRoute>,
): Promise<DepartureRoute> {
  try {
    return await fetcher();
  } catch (error) {
    console.warn("이동 경로를 불러오지 못했습니다.", {
      mode,
      error: getErrorName(error),
    });
    return unavailableRoute(mode);
  }
}

async function getNearbyPlaces(
  destination: UserLocation,
  destinationName: string,
): Promise<DeparturePlan["nearbyPlaces"]> {
  const key = createLocationCacheKey("nearby", destination);
  const cached = readCache(nearbyCache, key);
  if (cached) return cached;

  const existingRequest = nearbyRequests.get(key);
  if (existingRequest) return existingRequest;

  const request = fetchNearbyKakaoPlaces(destination)
    .then((places) =>
      places.filter(
        (place) =>
          place.distanceMeters === null ||
          place.distanceMeters > 30 ||
          normalizeName(place.name) !== normalizeName(destinationName),
      ),
    )
    .catch((error) => {
      console.warn("목적지 주변 장소를 불러오지 못했습니다.", {
        error: getErrorName(error),
      });
      return [];
    })
    .then((places) => {
      writeCache(nearbyCache, key, places, NEARBY_CACHE_TTL_MS);
      return places;
    })
    .finally(() => nearbyRequests.delete(key));
  nearbyRequests.set(key, request);
  return request;
}

function selectRecommendedMode(routes: RouteBundle) {
  if (
    routes.walking.status === "available" &&
    (routes.walking.distanceMeters ?? Number.MAX_SAFE_INTEGER) <= 1_800
  ) {
    return "walking";
  }
  if (routes.publicTransit.status === "available") return "publicTransit";
  if (routes.driving.status === "available") return "driving";
  if (routes.bicycle.status === "available") return "bicycle";
  if (routes.walking.status === "available") return "walking";
  return null;
}

function createSuggestedPlan(
  placeName: string,
  detail: TourismPlaceDetail | null,
  routes: RouteBundle,
  recommendedMode: DepartureRouteMode | null,
  nearbyPlaces: DeparturePlan["nearbyPlaces"],
): DeparturePlanStep[] {
  const steps: DeparturePlanStep[] = [];

  if (recommendedMode) {
    const route = routes[recommendedMode];
    steps.push({
      kind: "route",
      title: `${getModeLabel(recommendedMode)}으로 가볍게 출발하기`,
      description: createRouteDescription(route),
    });
  }

  steps.push({
    kind: "arrival",
    title: `${placeName}에 도착하면 천천히 둘러보기`,
    description:
      detail?.openingHours && detail?.restDate
        ? `${detail.openingHours} · 휴무 ${detail.restDate}`
        : detail?.openingHours ?? detail?.overview?.slice(0, 100) ?? null,
  });

  const nearby =
    nearbyPlaces.find((place) => place.category === "cafe") ??
    nearbyPlaces[0];
  if (nearby) {
    steps.push({
      kind: "nearby",
      title: `힘들면 ${nearby.name}에서 잠깐 쉬기`,
      description:
        nearby.distanceMeters === null
          ? nearby.categoryName
          : `${nearby.distanceMeters.toLocaleString("ko-KR")}m 거리`,
    });
  }

  return steps;
}

function createRouteDescription(route: DepartureRoute) {
  const parts = [];
  if (route.durationSeconds !== null) {
    parts.push(`약 ${Math.max(1, Math.round(route.durationSeconds / 60))}분`);
  }
  if (route.distanceMeters !== null) {
    parts.push(formatDistance(route.distanceMeters));
  }
  if (route.transfers !== null) parts.push(`환승 ${route.transfers}회`);
  return parts.join(" · ") || null;
}

function formatDistance(distanceMeters: number) {
  return distanceMeters < 1_000
    ? `${Math.round(distanceMeters)}m`
    : `${(distanceMeters / 1_000).toFixed(1)}km`;
}

function getModeLabel(mode: DepartureRouteMode) {
  return {
    publicTransit: "대중교통",
    walking: "도보",
    bicycle: "자전거",
    driving: "자동차",
  }[mode];
}

function unavailableRoute(mode: DepartureRouteMode): DepartureRoute {
  return {
    mode,
    status: "unavailable",
    durationSeconds: null,
    distanceMeters: null,
    transfers: null,
    fareWon: null,
    tollWon: null,
    taxiFareWon: null,
    externalUrl: null,
    steps: [],
  };
}

function createLocationCacheKey(
  namespace: string,
  ...locations: UserLocation[]
) {
  const value = locations
    .map(
      (location) =>
        `${location.latitude.toFixed(4)},${location.longitude.toFixed(4)}`,
    )
    .join("|");
  return createHash("sha256").update(`${namespace}:${value}`).digest("hex");
}

function readCache<T>(cache: Map<string, CachedValue<T>>, key: string) {
  const cached = cache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return cached.value;
}

function writeCache<T>(
  cache: Map<string, CachedValue<T>>,
  key: string,
  value: T,
  ttl: number,
) {
  if (cache.size >= MAX_MEMORY_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (typeof oldestKey === "string") cache.delete(oldestKey);
  }
  cache.set(key, { value, expiresAt: Date.now() + ttl });
}

function normalizeName(value: string) {
  return value.replace(/[\s()[\]{}·._-]+/g, "").toLowerCase();
}

function getErrorName(error: unknown) {
  return error instanceof Error ? error.name : "UnknownError";
}
