import { createHash } from "node:crypto";
import { prisma } from "@/server/db/prisma";
import {
  fetchKakaoMapRoute,
  fetchNearbyKakaoPlaces,
} from "@/server/maps/kakaoMapClient";
import { fetchKakaoDrivingRoute } from "@/server/maps/kakaoNaviClient";
import {
  calculateDistanceMeters,
  isWalkingDistance,
} from "@/server/departure/routeSelection";
import { createDepartureSuggestedPlan } from "@/server/departure/departureSuggestedPlan";
import { recommendablePlaceWhere } from "@/server/recommendations/recommendablePlaceWhere";
import { ensureTourismPlaceDetail } from "@/server/tourism/enrichTourismPlaceDetail";
import type {
  DeparturePlan,
  DepartureRoute,
  DepartureRouteMode,
} from "@/shared/api/departurePlan";
import type { UserLocation } from "@/shared/tuti/types";

const NEARBY_CACHE_TTL_MS = 6 * 60 * 60 * 1_000;
const MAX_MEMORY_CACHE_ENTRIES = 500;

type CachedValue<T> = {
  expiresAt: number;
  value: T;
};

type RouteBundle = DeparturePlan["routes"];

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
      ...recommendablePlaceWhere,
      id: placeId,
    },
    select: {
      id: true,
      name: true,
      sourceAddress: true,
      sourceContentType: true,
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
    getNearbyPlaces(destination, place.id, place.name),
  ]);
  const recommendedMode = selectRecommendedMode(
    routes,
    origin,
    destination,
  );

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
    suggestedPlan: createDepartureSuggestedPlan({
      placeName: place.name,
      contentTypeId: place.sourceContentType,
      detail,
    }),
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
  const existingRequest = routeRequests.get(key);
  if (existingRequest) return existingRequest;

  const request = fetchRouteBundle(origin, destination, destinationName)
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
  destinationId: string,
  destinationName: string,
): Promise<DeparturePlan["nearbyPlaces"]> {
  const key = createLocationCacheKey("nearby", destination);
  const cached = readCache(nearbyCache, key);
  if (cached) return cached;

  const existingRequest = nearbyRequests.get(key);
  if (existingRequest) return existingRequest;

  const request = fetchTutiNearbyPlaces(
    destination,
    destinationId,
    destinationName,
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

async function fetchTutiNearbyPlaces(
  destination: UserLocation,
  destinationId: string,
  destinationName: string,
): Promise<DeparturePlan["nearbyPlaces"]> {
  const [latestRelated, kakaoPlaces] = await Promise.all([
    prisma.relatedTourismSourceRecord.aggregate({
      _max: { baseYm: true },
    }),
    fetchNearbyKakaoPlaces(destination).catch((error) => {
      console.warn("카카오 주변 장소를 불러오지 못했습니다.", {
        error: getErrorName(error),
      });
      return [];
    }),
  ]);
  const baseYm = latestRelated._max.baseYm;
  const destinationKey = normalizeName(destinationName);
  const coreRows = await prisma.municipalCoreTourismSourceRecord.findMany({
    where: {
      OR: [
        { touristSpotName: destinationName },
        {
          touristSpotName: {
            contains: destinationName,
            mode: "insensitive",
          },
        },
      ],
    },
    select: {
      touristSpotCode: true,
      touristSpotName: true,
    },
    orderBy: { baseYm: "desc" },
    take: 50,
  });
  const coreSpotCodes = [
    ...new Set(
      coreRows
        .filter(
          (row) => normalizeName(row.touristSpotName) === destinationKey,
        )
        .map((row) => row.touristSpotCode),
    ),
  ];
  let relatedRows =
    baseYm && coreSpotCodes.length > 0
      ? await prisma.relatedTourismSourceRecord.findMany({
          where: {
            baseYm,
            touristSpotCode: { in: coreSpotCodes },
          },
          orderBy: { rank: "asc" },
          take: 100,
        })
      : [];

  if (baseYm && relatedRows.length === 0) {
    relatedRows = (
      await prisma.relatedTourismSourceRecord.findMany({
        where: {
          baseYm,
          OR: [
            { touristSpotName: destinationName },
            {
              touristSpotName: {
                contains: destinationName,
                mode: "insensitive",
              },
            },
          ],
        },
        orderBy: { rank: "asc" },
        take: 100,
      })
    ).filter(
      (row) => normalizeName(row.touristSpotName) === destinationKey,
    );
  }

  const relatedTargetCodes = [
    ...new Set(relatedRows.map((row) => row.relatedTouristSpotCode)),
  ];
  const relatedTargetCoreRows = relatedTargetCodes.length > 0
    ? await prisma.municipalCoreTourismSourceRecord.findMany({
        where: { touristSpotCode: { in: relatedTargetCodes } },
        select: {
          touristSpotCode: true,
          touristSpotName: true,
        },
        orderBy: { baseYm: "desc" },
        distinct: ["touristSpotCode", "touristSpotName"],
        take: 300,
      })
    : [];
  const relationByTargetCode = new Map(
    relatedRows.map((row) => [row.relatedTouristSpotCode, row]),
  );
  const relatedByName = new Map(
    relatedRows.map((row) => [normalizeName(row.relatedTouristSpotName), row]),
  );

  relatedTargetCoreRows.forEach((row) => {
    const relation = relationByTargetCode.get(row.touristSpotCode);
    if (relation) {
      relatedByName.set(normalizeName(row.touristSpotName), relation);
    }
  });
  const kakaoByName = new Map(
    kakaoPlaces.map((place) => [normalizeName(place.name), place]),
  );
  const candidateNames = [
    ...new Set([
      ...relatedRows.map((row) => row.relatedTouristSpotName),
      ...relatedTargetCoreRows.map((row) => row.touristSpotName),
      ...kakaoPlaces.map((place) => place.name),
    ]),
  ];

  if (candidateNames.length === 0) return [];

  const candidates = await prisma.place.findMany({
    where: {
      AND: [
        recommendablePlaceWhere,
        { id: { not: destinationId } },
        { name: { in: candidateNames } },
      ],
    },
    select: {
      id: true,
      name: true,
      sourceContentType: true,
      sourceAddress: true,
      latitude: true,
      longitude: true,
    },
  });

  const continuationPlaces = candidates
    .map((candidate) => {
      const key = normalizeName(candidate.name);
      const relation = relatedByName.get(key);
      const kakao = kakaoByName.get(key);
      const location = {
        latitude: Number(candidate.latitude),
        longitude: Number(candidate.longitude),
      };
      const distanceMeters = Math.round(
        calculateDistanceMeters(destination, location),
      );

      return {
        place: {
          id: candidate.id,
          name: candidate.name,
          kind: "continuation" as const,
          category: toNearbyCategory(candidate.sourceContentType),
          categoryName:
            relation?.relatedCategorySmallName ??
            relation?.relatedCategoryMediumName ??
            kakao?.categoryName ??
            "주변 장소",
          address: candidate.sourceAddress,
          phone: kakao?.phone ?? null,
          distanceMeters,
          ...location,
          externalUrl:
            kakao?.externalUrl ?? createKakaoPlaceSearchUrl(candidate.name),
        } satisfies DeparturePlan["nearbyPlaces"][number],
        relatedRank: relation?.rank ?? Number.MAX_SAFE_INTEGER,
        isRelated: Boolean(relation),
      };
    })
    .filter(({ isRelated, place }) => {
      if (isRelated) return place.distanceMeters <= 10_000;
      const kakao = kakaoByName.get(normalizeName(place.name));
      return (
        kakao?.category !== "cafe" && place.distanceMeters <= 1_500
      );
    })
    .sort((left, right) => {
      if (left.isRelated !== right.isRelated) return left.isRelated ? -1 : 1;
      if (left.relatedRank !== right.relatedRank) {
        return left.relatedRank - right.relatedRank;
      }
      return left.place.distanceMeters - right.place.distanceMeters;
    })
    .slice(0, 4)
    .map(({ place }) => place);
  const continuationNames = new Set(
    continuationPlaces.map((place) => normalizeName(place.name)),
  );
  const restPlaces = kakaoPlaces
    .filter(
      (place) =>
        place.category === "cafe" &&
        place.distanceMeters !== null &&
        place.distanceMeters > 30 &&
        place.distanceMeters <= 800 &&
        normalizeName(place.name) !== destinationKey &&
        !continuationNames.has(normalizeName(place.name)),
    )
    .slice(0, 4)
    .map((place) => ({
      ...place,
      kind: "rest" as const,
    }));

  return [...continuationPlaces, ...restPlaces];
}

function toNearbyCategory(
  contentTypeId: string | null,
): DeparturePlan["nearbyPlaces"][number]["category"] {
  if (contentTypeId === "14") return "culture";
  if (contentTypeId === "39") return "cafe";
  return "attraction";
}

function createKakaoPlaceSearchUrl(name: string) {
  return `https://map.kakao.com/link/search/${encodeURIComponent(name)}`;
}

function selectRecommendedMode(
  routes: RouteBundle,
  origin: UserLocation,
  destination: UserLocation,
) {
  if (
    isWalkingDistance(origin, destination) &&
    isAvailableRoute(routes.walking)
  ) {
    return "walking";
  }
  if (isAvailableRoute(routes.publicTransit)) return "publicTransit";
  if (isAvailableRoute(routes.driving)) return "driving";
  if (isAvailableRoute(routes.bicycle)) return "bicycle";
  if (isAvailableRoute(routes.walking)) return "walking";
  return null;
}

function isAvailableRoute(route: DepartureRoute) {
  return route.status === "available" && route.durationSeconds !== null;
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
