import type { TutiPlace } from "@/lib/recommendations";

const MAX_IDENTITY_DISTANCE_METERS = 3_000;

export type TouristSpotIdentityRecord = {
  areaCode: string;
  areaName: string;
  sigunguCode: string;
  sigunguName: string;
  touristSpotName: string;
  longitude: number | null;
  latitude: number | null;
};

export type TouristSpotContext = Pick<
  TouristSpotIdentityRecord,
  "areaCode" | "sigunguCode" | "touristSpotName"
>;

/**
 * 이름이 같은 관광지는 지역과 좌표로 실제 장소가 확인될 때만 연결한다.
 * 좌표가 없으면 시도와 시군구가 모두 일치해야 하며, 그 외에는 내부 추정값을 쓰도록
 * 매칭하지 않는다.
 */
export function matchTouristSpotContexts(
  places: TutiPlace[],
  records: TouristSpotIdentityRecord[],
) {
  const recordsByName = new Map<string, TouristSpotIdentityRecord[]>();
  for (const record of records) {
    const group = recordsByName.get(record.touristSpotName) ?? [];
    group.push(record);
    recordsByName.set(record.touristSpotName, group);
  }

  const contexts = new Map<string, TouristSpotContext>();
  for (const place of places) {
    const candidates = recordsByName.get(place.name) ?? [];
    const match = findIdentityMatch(place, candidates);
    if (!match) continue;

    contexts.set(place.id, {
      areaCode: match.areaCode,
      sigunguCode: match.sigunguCode,
      touristSpotName: match.touristSpotName,
    });
  }

  return contexts;
}

function findIdentityMatch(
  place: TutiPlace,
  candidates: TouristSpotIdentityRecord[],
) {
  const placeHasCoordinates =
    isCoordinate(place.latitude, -90, 90) &&
    isCoordinate(place.longitude, -180, 180);
  const candidatesWithCoordinates = candidates.filter(
    (candidate) =>
      isCoordinate(candidate.latitude, -90, 90) &&
      isCoordinate(candidate.longitude, -180, 180),
  );

  if (placeHasCoordinates && candidatesWithCoordinates.length > 0) {
    const nearby = candidatesWithCoordinates
      .map((candidate) => ({
        candidate,
        distanceMeters: haversineDistanceMeters(
          place.latitude as number,
          place.longitude as number,
          candidate.latitude as number,
          candidate.longitude as number,
        ),
      }))
      .filter(
        ({ distanceMeters }) =>
          distanceMeters <= MAX_IDENTITY_DISTANCE_METERS,
      )
      .sort((a, b) => a.distanceMeters - b.distanceMeters);

    return nearby[0]?.candidate;
  }

  const placeSido = normalizeRegionName(place.sourceSidoName);
  const placeSigungu = normalizeRegionName(place.sourceSigunguName);
  if (!placeSido || !placeSigungu) return undefined;

  return candidates.find(
    (candidate) =>
      normalizeRegionName(candidate.areaName) === placeSido &&
      normalizeRegionName(candidate.sigunguName) === placeSigungu,
  );
}

function normalizeRegionName(value: string | undefined) {
  return value?.normalize("NFKC").replace(/\s+/g, "").trim() ?? "";
}

function isCoordinate(
  value: number | null | undefined,
  min: number,
  max: number,
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
  );
}

function haversineDistanceMeters(
  fromLatitude: number,
  fromLongitude: number,
  toLatitude: number,
  toLongitude: number,
) {
  const earthRadiusMeters = 6_371_000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(toLatitude - fromLatitude);
  const longitudeDelta = toRadians(toLongitude - fromLongitude);
  const fromLatitudeRadians = toRadians(fromLatitude);
  const toLatitudeRadians = toRadians(toLatitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitudeRadians) *
      Math.cos(toLatitudeRadians) *
      Math.sin(longitudeDelta / 2) ** 2;

  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(haversine));
}
