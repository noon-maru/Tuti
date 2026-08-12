import type {
  LongDistanceJourney,
  LongDistanceMode,
  TutiPlace,
} from "@/lib/recommendations";
import { prisma } from "@/server/db/prisma";
import { fetchKakaoMapRoute } from "@/server/maps/kakaoMapClient";
import { toTravelTimeSummary } from "@/server/departure/travelTimeSummary";
import { enrichPlacesWithCrowdForecast } from "@/server/recommendations/crowdForecast";
import { recommendablePlaceWhere } from "@/server/recommendations/recommendablePlaceWhere";
import {
  fetchExpressBusSchedules,
  fetchTrainSchedules,
  type TagoScheduledService,
} from "@/server/transport/dataGoTransportClient";
import type { IntakeAnswers, UserLocation } from "@/shared/tuti/types";

const KOREA_TIME_ZONE = "Asia/Seoul";
const MINIMUM_LONG_DISTANCE_METERS = 60_000;
const MAXIMUM_DESTINATION_ACCESS_METERS = 28_000;
const MINIMUM_STAY_MS = 3 * 60 * 60 * 1_000;
const scheduleCache = new Map<
  string,
  { expiresAt: number; services: NormalizedService[] }
>();
const routeCache = new Map<
  string,
  {
    expiresAt: number;
    route: Promise<Awaited<ReturnType<typeof fetchKakaoMapRoute>>>;
  }
>();

type Hub = {
  id: string;
  externalId: string;
  sourceName: string;
  mode: "rail" | "express_bus";
  name: string;
  latitude: number;
  longitude: number;
};

type CandidatePlace = Omit<TutiPlace, "longDistanceJourney"> & {
  destinationHub: Hub;
  straightDistanceMeters: number;
};

type NormalizedService = {
  serviceName: string;
  serviceNumber?: string;
  departurePlaceName?: string;
  arrivalPlaceName?: string;
  departureAt: Date;
  arrivalAt: Date;
  fareWon?: number;
};

export async function createLongDistanceRecommendations(
  answers: IntakeAnswers,
  location: UserLocation,
  excludePlaceIds: string[],
): Promise<TutiPlace[]> {
  const hubs = (await prisma.transportHub.findMany({
    where: {
      isActive: true,
      coordinateSource: "kakao_map",
      coordinateVerifiedAt: { not: null },
      kakaoPlaceId: { not: null },
    },
    select: {
      id: true,
      externalId: true,
      sourceName: true,
      mode: true,
      name: true,
      latitude: true,
      longitude: true,
    },
  })).map((hub) => ({
      ...hub,
      latitude: Number(hub.latitude),
      longitude: Number(hub.longitude),
    }));

  if (hubs.length === 0) return [];

  const originHubs = selectOriginHubs(hubs, location);
  debugLog("허브", {
    total: hubs.length,
    origins: originHubs.map((hub) => `${hub.mode}:${hub.name}`),
  });
  if (originHubs.length === 0) return [];

  const rows = await prisma.place.findMany({
    where: {
      ...recommendablePlaceWhere,
      id: { notIn: excludePlaceIds.slice(0, 20) },
    },
    orderBy: [{ fatigue: "asc" }, { candidateScore: "desc" }],
    take: 2_500,
    select: {
      id: true,
      name: true,
      phrase: true,
      note: true,
      image: true,
      travelTime: true,
      crowd: true,
      today: true,
      fatigue: true,
      movementLevel: true,
      moodTags: true,
      sourceContentType: true,
      latitude: true,
      longitude: true,
    },
  });

  const candidates = rows.flatMap((row): CandidatePlace[] => {
    const latitude = Number(row.latitude);
    const longitude = Number(row.longitude);
    const straightDistanceMeters = distanceMeters(location, {
      latitude,
      longitude,
    });
    if (straightDistanceMeters < MINIMUM_LONG_DISTANCE_METERS) return [];

    const place = {
      id: row.id,
      name: row.name,
      phrase: row.phrase,
      note: row.note,
      image: row.image,
      travelTime: row.travelTime,
      crowd: row.crowd,
      today: row.today,
      fatigue: row.fatigue,
      movementLevel: row.movementLevel,
      moodTags: row.moodTags,
      sourceContentType: row.sourceContentType ?? undefined,
      latitude,
      longitude,
      distanceMeters: straightDistanceMeters,
      straightDistanceMeters,
    };

    return (["rail", "express_bus"] as const).flatMap((mode) => {
      if (!originHubs.some((origin) => origin.mode === mode)) return [];
      const destinationHub = nearestHub(
        hubs.filter((hub) => hub.mode === mode),
        { latitude, longitude },
      );
      if (
        !destinationHub ||
        distanceMeters(location, destinationHub) <
          MINIMUM_LONG_DISTANCE_METERS ||
        distanceMeters(destinationHub, { latitude, longitude }) >
          MAXIMUM_DESTINATION_ACCESS_METERS
      ) {
        return [];
      }
      return [{ ...place, destinationHub }];
    });
  });

  const diverseCandidates = selectCandidateDestinations(candidates, 36);
  debugLog("후보", {
    places: rows.length,
    linked: candidates.length,
    selected: diverseCandidates.map(
      (candidate) =>
        `${candidate.name}:${candidate.destinationHub.mode}:${candidate.destinationHub.name}`,
    ),
  });
  const planned: TutiPlace[] = [];

  for (const candidate of diverseCandidates) {
    if (planned.some((place) => place.id === candidate.id)) continue;
    const compatibleOrigins = originHubs.filter(
      (origin) => origin.mode === candidate.destinationHub.mode,
    );
    for (const originHub of compatibleOrigins) {
      const journey = await planJourney(
        originHub,
        candidate.destinationHub,
        location,
        { latitude: candidate.latitude!, longitude: candidate.longitude! },
        answers.longDistanceTiming ?? "tomorrow_day_trip",
      ).catch(() => null);
      if (!journey) continue;

      const { destinationHub, straightDistanceMeters, ...place } = candidate;
      void destinationHub;
      planned.push({
        ...place,
        distanceMeters: straightDistanceMeters,
        travelTimeSummary: {
          mode: "publicTransit",
          durationSeconds: journey.outboundDurationSeconds,
          distanceMeters: straightDistanceMeters,
          transfers: sumKnownRouteValues(
            journey.originAccess.transfers,
            journey.destinationAccess.transfers,
          ),
          walkingDistanceMeters: sumKnownRouteValues(
            journey.originAccess.walkingDistanceMeters,
            journey.destinationAccess.walkingDistanceMeters,
          ),
        },
        longDistanceJourney: journey,
        reason: "멀리 가도 갈아타는 수고가 적어요.",
        reasonDetail: `${journey.originHub.name}에서 ${journey.destinationHub.name}까지 한 번에 이어지는 이동이에요.`,
        reasonFactors: ["burden", "movement"],
        cardPhrase: `${getModeLabel(journey.mode)} 한 번으로 다른 공기를 만나는 곳`,
      });
      break;
    }
    if (planned.length >= 6) break;
  }

  return enrichPlacesWithCrowdForecast(planned);
}

function sumKnownRouteValues(
  first: number | null,
  second: number | null,
) {
  return first === null || second === null ? null : first + second;
}

function selectOriginHubs(hubs: Hub[], location: UserLocation) {
  return (["rail", "express_bus"] as const).flatMap((mode) =>
    hubs
      .filter((hub) => hub.mode === mode)
      .sort((left, right) =>
        distanceMeters(left, location) - distanceMeters(right, location)
      )
      .filter((hub) => distanceMeters(hub, location) <= 65_000)
      .slice(0, mode === "rail" ? 3 : 2),
  );
}

function selectCandidateDestinations(candidates: CandidatePlace[], limit: number) {
  const selected: CandidatePlace[] = [];
  const perHub = new Map<string, number>();
  for (const candidate of candidates.sort((left, right) => {
    const priorityGap =
      getHubRoutePriority(left.destinationHub) -
      getHubRoutePriority(right.destinationHub);
    return priorityGap || left.fatigue - right.fatigue;
  })) {
    const count = perHub.get(candidate.destinationHub.id) ?? 0;
    if (count >= 4) continue;
    perHub.set(candidate.destinationHub.id, count + 1);
    selected.push(candidate);
    if (selected.length >= limit) break;
  }
  return selected;
}

async function planJourney(
  originHub: Hub,
  destinationHub: Hub,
  userLocation: UserLocation,
  placeLocation: UserLocation,
  timing: "tomorrow_day_trip" | "overnight_trip",
): Promise<LongDistanceJourney | null> {
  if (originHub.externalId === destinationHub.externalId) return null;
  const today = getKoreanDateKey();
  const tomorrow = addKoreanDays(today, 1);
  const outboundDate = timing === "overnight_trip" ? today : tomorrow;
  const returnDate = timing === "overnight_trip" ? tomorrow : outboundDate;
  const [outboundServices, returnServices, originRoute, destinationRoute] =
    await Promise.all([
      getSchedules(originHub, destinationHub, outboundDate),
      getSchedules(destinationHub, originHub, returnDate),
      fetchCachedTransitRoute(
        `origin:${locationCell(userLocation)}:${originHub.id}`,
        30 * 60_000,
        userLocation,
        originHub,
        originHub.name,
      ),
      fetchCachedTransitRoute(
        `destination:${destinationHub.id}:${locationCell(placeLocation)}`,
        6 * 60 * 60_000,
        destinationHub,
        placeLocation,
        "추천 장소",
      ),
    ]);

  debugLog("계획 시도", {
    route: `${originHub.name}->${destinationHub.name}`,
    outbound: outboundServices.length,
    returns: returnServices.length,
    originRoute: originRoute.status,
    destinationRoute: destinationRoute.status,
  });

  const originAccess = toTravelTimeSummary(originRoute);
  const destinationAccess = toTravelTimeSummary(destinationRoute);
  if (!originAccess || !destinationAccess) return null;
  if (originAccess.durationSeconds > 65 * 60) return null;
  if (destinationAccess.durationSeconds > 40 * 60) return null;

  const earliestDeparture = timing === "overnight_trip"
    ? Date.now() + originAccess.durationSeconds * 1_000 + 35 * 60_000
    : toKoreanDateTime(outboundDate, 8, 0).getTime();
  const outbound = outboundServices.find(
    (service) => service.departureAt.getTime() >= earliestDeparture,
  );
  if (!outbound) return null;

  const earliestReturn = timing === "overnight_trip"
    ? toKoreanDateTime(returnDate, 10, 30).getTime()
    : outbound.arrivalAt.getTime() +
      destinationAccess.durationSeconds * 2_000 +
      MINIMUM_STAY_MS;
  const returnService = returnServices.find(
    (service) => service.departureAt.getTime() >= earliestReturn,
  );
  if (!returnService) return null;

  const mode: LongDistanceMode =
    originHub.mode === "rail" ? "highSpeedRail" : "expressBus";
  const outboundDurationSeconds = Math.round(
    (outbound.arrivalAt.getTime() - outbound.departureAt.getTime()) / 1_000 +
      originAccess.durationSeconds +
      destinationAccess.durationSeconds,
  );
  const fareValues = [outbound.fareWon, returnService.fareWon].filter(
    (value): value is number => typeof value === "number",
  );

  return {
    timing,
    departureDate: outboundDate,
    returnDate,
    mode,
    originHub: toPublicHub(originHub),
    destinationHub: toPublicHub(destinationHub),
    outbound: toPublicService(outbound),
    returnService: toPublicService(returnService),
    originAccess,
    destinationAccess,
    outboundDurationSeconds,
    totalFareWon:
      fareValues.length === 2 ? fareValues[0] + fareValues[1] : undefined,
    bookingUrl:
      mode === "highSpeedRail"
        ? "https://www.korail.com/ticket/search"
        : "https://www.kobus.co.kr",
  };
}

async function getSchedules(origin: Hub, destination: Hub, date: string) {
  const key = `${origin.mode}:${origin.externalId}:${destination.externalId}:${date}`;
  const cached = scheduleCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.services;

  let items: TagoScheduledService[];
  if (origin.mode === "rail") {
    const settled = await Promise.allSettled(
      ["00", "17"].map((trainGradeCode) =>
        fetchTrainSchedules({
          departureStationId: origin.externalId,
          arrivalStationId: destination.externalId,
          departureDate: date,
          trainGradeCode,
        }),
      ),
    );
    items = settled.flatMap((result) =>
      result.status === "fulfilled" ? result.value : [],
    );
  } else {
    items = await fetchExpressBusSchedules({
      departureTerminalId: origin.externalId,
      arrivalTerminalId: destination.externalId,
      departureDate: date,
    });
  }

  const services = items
    .flatMap(normalizeService)
    .filter((service) => getDateKey(service.departureAt) === date)
    .filter(
      (service) =>
        matchesServiceHub(service.departurePlaceName, origin.sourceName) &&
        matchesServiceHub(service.arrivalPlaceName, destination.sourceName),
    )
    .sort((left, right) => left.departureAt.getTime() - right.departureAt.getTime());
  scheduleCache.set(key, { expiresAt: Date.now() + 30 * 60_000, services });
  return services;
}

function normalizeService(item: TagoScheduledService): NormalizedService[] {
  const departureAt = parseTagoDate(item.depplandtime ?? item.depPlandTime);
  const arrivalAt = parseTagoDate(item.arrplandtime ?? item.arrPlandTime);
  if (!departureAt || !arrivalAt) return [];
  const fare = Number(item.adultcharge ?? item.charge);
  return [{
    serviceName: clean(item.traingradename ?? item.gradeNm) ?? "장거리 교통",
    serviceNumber: clean(item.trainno),
    departurePlaceName: clean(item.depplacename ?? item.depPlaceNm),
    arrivalPlaceName: clean(item.arrplacename ?? item.arrPlaceNm),
    departureAt,
    arrivalAt,
    fareWon: Number.isFinite(fare) && fare > 0 ? fare : undefined,
  }];
}

function parseTagoDate(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length < 12) return null;
  const iso = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}T${digits.slice(8, 10)}:${digits.slice(10, 12)}:${digits.slice(12, 14) || "00"}+09:00`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toPublicHub(hub: Hub) {
  return {
    id: hub.id,
    name: hub.name,
    latitude: hub.latitude,
    longitude: hub.longitude,
  };
}

function toPublicService(service: NormalizedService) {
  return {
    serviceName: service.serviceName,
    serviceNumber: service.serviceNumber,
    departureAt: service.departureAt.toISOString(),
    arrivalAt: service.arrivalAt.toISOString(),
    fareWon: service.fareWon,
  };
}

function nearestHub(hubs: Hub[], location: UserLocation) {
  return hubs.reduce<Hub | null>((nearest, hub) =>
    !nearest || distanceMeters(hub, location) < distanceMeters(nearest, location)
      ? hub
      : nearest,
  null);
}

function distanceMeters(left: UserLocation, right: UserLocation) {
  const earthRadius = 6_371_000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(right.latitude - left.latitude);
  const longitudeDelta = toRadians(right.longitude - left.longitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(left.latitude)) *
      Math.cos(toRadians(right.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getKoreanDateKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: KOREA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}${value("month")}${value("day")}`;
}

function addKoreanDays(dateKey: string, days: number) {
  const date = toKoreanDateTime(dateKey, 12, 0);
  date.setTime(date.getTime() + days * 24 * 60 * 60 * 1_000);
  return getDateKey(date);
}

function toKoreanDateTime(dateKey: string, hour: number, minute: number) {
  const iso = `${dateKey.slice(0, 4)}-${dateKey.slice(4, 6)}-${dateKey.slice(6, 8)}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+09:00`;
  return new Date(iso);
}

function getDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: KOREA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}${value("month")}${value("day")}`;
}

function clean(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim() || undefined
    : undefined;
}

function normalizeHubName(value: string) {
  return value.normalize("NFC").replace(/[()\s·.역-]/g, "").toLowerCase();
}

function matchesServiceHub(serviceName: string | undefined, hubName: string) {
  if (!serviceName) return true;
  const service = normalizeHubName(serviceName);
  const hub = normalizeHubName(hubName);
  return service === hub || service.includes(hub) || hub.includes(service);
}

function getHubRoutePriority(hub: Hub) {
  const preferred = hub.mode === "rail"
    ? [
        "대전", "동대구", "천안아산", "부산", "강릉", "전주",
        "광주송정", "경주", "울산", "익산", "순천", "포항",
      ]
    : [
        "천안", "대전복합", "강릉", "속초", "춘천", "부산",
        "광주유스퀘어", "전주", "청주고속", "공주",
      ];
  const index = preferred.findIndex(
    (name) => normalizeHubName(name) === normalizeHubName(hub.sourceName),
  );
  return index < 0 ? 100 : index;
}

function getModeLabel(mode: LongDistanceMode) {
  return mode === "highSpeedRail" ? "고속열차" : "고속버스";
}

function fetchCachedTransitRoute(
  key: string,
  ttlMs: number,
  origin: UserLocation,
  destination: UserLocation,
  destinationName: string,
) {
  const cached = routeCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.route;
  const route = fetchKakaoMapRoute("publicTransit", {
    origin,
    destination,
    destinationName,
  }).catch((error) => {
    routeCache.delete(key);
    throw error;
  });
  routeCache.set(key, { expiresAt: Date.now() + ttlMs, route });
  return route;
}

function locationCell(location: UserLocation) {
  return `${location.latitude.toFixed(3)}:${location.longitude.toFixed(3)}`;
}

function debugLog(label: string, value: unknown) {
  if (process.env.TUTI_TRANSPORT_DEBUG !== "1") return;
  console.log(`[더 멀리 진단] ${label}`, value);
}
