import type {
  DepartureNearbyPlace,
  DepartureRoute,
  DepartureRouteMode,
  DepartureRouteStep,
} from "@/shared/api/departurePlan";
import type { UserLocation } from "@/shared/tuti/types";
import { recordExternalLocationTransfer } from "@/server/location/compliance";
import { requireExternalLocationProcessingMode } from "@/server/location/externalProcessing";

const KAKAO_MAP_BASE_URL = "https://dapi.kakao.com/v2";
const KAKAO_REQUEST_TIMEOUT_MS = 10_000;

type KakaoMapRouteMode = Exclude<DepartureRouteMode, "driving">;

type RouteInput = {
  origin: UserLocation;
  destination: UserLocation;
  destinationName: string;
};

type KakaoRouteStep = {
  properties?: {
    guidance?: string;
    distance?: number;
    time?: number;
    vehicles?: Array<{ name?: string; type?: string }>;
  };
};

type KakaoSimpleRouteResponse = {
  route?: {
    properties?: {
      totalDistance?: number;
      totalTime?: number;
      landingUrl?: string;
    };
    legs?: Array<{ steps?: KakaoRouteStep[] }>;
  };
};

type KakaoTransitResponse = {
  status?: string;
  properties?: { landingURL?: string };
  routes?: Array<{
    properties?: {
      totalDistance?: number;
      totalTime?: number;
      transfers?: number;
      fare?: { value?: number; min?: number };
    };
    steps?: KakaoRouteStep[];
  }>;
};

type KakaoCategoryDocument = {
  id?: string;
  place_name?: string;
  category_name?: string;
  phone?: string;
  address_name?: string;
  road_address_name?: string;
  x?: string;
  y?: string;
  place_url?: string;
  distance?: string;
};

type KakaoCategoryResponse = {
  documents?: KakaoCategoryDocument[];
};

export type KakaoPlaceSearchResult = {
  id: string;
  name: string;
  address: string | null;
  categoryName: string | null;
  latitude: number;
  longitude: number;
};

export class KakaoMapError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "KakaoMapError";
  }
}

export async function fetchKakaoMapRoute(
  mode: KakaoMapRouteMode,
  input: RouteInput,
): Promise<DepartureRoute> {
  const externalMode = requireExternalLocationProcessingMode();
  const operation =
    mode === "publicTransit"
      ? "publictraffic"
      : mode === "walking"
        ? "walk"
        : "bicycle";
  await recordExternalLocationTransfer({
    recipient: "Kakao",
    purpose: `${mode} 경로와 예상 이동시간 계산`,
    method: `GET dapi.kakao.com/v2/routing/${operation}`,
    mode: externalMode,
  });
  const payload = await fetchKakaoJson<
    KakaoTransitResponse | KakaoSimpleRouteResponse
  >(`${KAKAO_MAP_BASE_URL}/routing/${operation}`, {
    start_x: String(input.origin.longitude),
    start_y: String(input.origin.latitude),
    end_x: String(input.destination.longitude),
    end_y: String(input.destination.latitude),
    s_name: "현재 위치",
    e_name: input.destinationName,
    ...(mode === "walking" ? { route_mode: "ACCESSIBLE" } : {}),
  });

  return mode === "publicTransit"
    ? normalizeTransitRoute(payload as KakaoTransitResponse)
    : normalizeSimpleRoute(mode, payload as KakaoSimpleRouteResponse);
}

export async function fetchNearbyKakaoPlaces(
  destination: UserLocation,
): Promise<DepartureNearbyPlace[]> {
  const categories = [
    { code: "AT4", category: "attraction" as const },
    { code: "CT1", category: "culture" as const },
    { code: "CE7", category: "cafe" as const },
  ];
  const settled = await Promise.allSettled(
    categories.map(async ({ code, category }) => {
      const payload = await fetchKakaoJson<KakaoCategoryResponse>(
        `${KAKAO_MAP_BASE_URL}/local/search/category.json`,
        {
          category_group_code: code,
          x: String(destination.longitude),
          y: String(destination.latitude),
          radius: "1500",
          size: "5",
          sort: "distance",
        },
      );

      return (payload.documents ?? []).flatMap((item) => {
        const place = normalizeNearbyPlace(item, category);
        return place ? [place] : [];
      });
    }),
  );
  const deduplicated = new Map<string, DepartureNearbyPlace>();

  settled.forEach((result) => {
    if (result.status !== "fulfilled") return;
    result.value.slice(0, 3).forEach((place) => {
      if (!deduplicated.has(place.id)) deduplicated.set(place.id, place);
    });
  });

  return [...deduplicated.values()]
    .sort(
      (left, right) =>
        (left.distanceMeters ?? Number.MAX_SAFE_INTEGER) -
        (right.distanceMeters ?? Number.MAX_SAFE_INTEGER),
    )
    .slice(0, 6);
}

export async function searchKakaoPlaces(
  query: string,
  size = 5,
): Promise<KakaoPlaceSearchResult[]> {
  const payload = await fetchKakaoJson<KakaoCategoryResponse>(
    `${KAKAO_MAP_BASE_URL}/local/search/keyword.json`,
    { query, size: String(Math.max(1, Math.min(size, 15))) },
  );

  return (payload.documents ?? []).flatMap((item) => {
    const id = cleanText(item.id);
    const name = cleanText(item.place_name);
    const latitude = finiteNumber(item.y);
    const longitude = finiteNumber(item.x);
    if (!id || !name || latitude === null || longitude === null) return [];

    return [{
      id,
      name,
      address: cleanText(item.road_address_name) ?? cleanText(item.address_name),
      categoryName: cleanText(item.category_name),
      latitude,
      longitude,
    }];
  });
}

function normalizeTransitRoute(
  payload: KakaoTransitResponse,
): DepartureRoute {
  const route = payload.status === "OK" ? payload.routes?.[0] : undefined;
  if (!route?.properties) return unavailableRoute("publicTransit");

  return {
    mode: "publicTransit",
    status: "available",
    durationSeconds: finiteNumber(route.properties.totalTime),
    distanceMeters: finiteNumber(route.properties.totalDistance),
    transfers: finiteNumber(route.properties.transfers),
    fareWon: finiteNumber(
      route.properties.fare?.value ?? route.properties.fare?.min,
    ),
    tollWon: null,
    taxiFareWon: null,
    externalUrl: normalizeUrl(payload.properties?.landingURL),
    steps: normalizeRouteSteps(route.steps),
  };
}

function normalizeSimpleRoute(
  mode: "walking" | "bicycle",
  payload: KakaoSimpleRouteResponse,
): DepartureRoute {
  const route = payload.route;
  if (!route?.properties) return unavailableRoute(mode);

  return {
    mode,
    status: "available",
    durationSeconds: finiteNumber(route.properties.totalTime),
    distanceMeters: finiteNumber(route.properties.totalDistance),
    transfers: null,
    fareWon: null,
    tollWon: null,
    taxiFareWon: null,
    externalUrl: normalizeUrl(route.properties.landingUrl),
    steps: normalizeRouteSteps(
      route.legs?.flatMap((leg) => leg.steps ?? []),
    ),
  };
}

function normalizeRouteSteps(
  steps: KakaoRouteStep[] | undefined,
): DepartureRouteStep[] {
  return (steps ?? []).flatMap((step) => {
    const guidance = cleanText(step.properties?.guidance);
    if (!guidance) return [];

    return [
      {
        guidance,
        durationSeconds: finiteNumber(step.properties?.time),
        distanceMeters: finiteNumber(step.properties?.distance),
        vehicle:
          step.properties?.vehicles
            ?.map((vehicle) => cleanText(vehicle.name ?? vehicle.type))
            .filter((value): value is string => Boolean(value))
            .join(" · ") || null,
      },
    ];
  });
}

function normalizeNearbyPlace(
  item: KakaoCategoryDocument,
  category: DepartureNearbyPlace["category"],
): DepartureNearbyPlace | null {
  const id = cleanText(item.id);
  const name = cleanText(item.place_name);
  const latitude = finiteNumber(item.y);
  const longitude = finiteNumber(item.x);
  const externalUrl = normalizeUrl(item.place_url);

  if (!id || !name || latitude === null || longitude === null || !externalUrl) {
    return null;
  }

  return {
    id,
    name,
    kind: "rest",
    category,
    categoryName: cleanText(item.category_name) ?? "주변 장소",
    address:
      cleanText(item.road_address_name) ?? cleanText(item.address_name),
    phone: cleanText(item.phone),
    distanceMeters: finiteNumber(item.distance),
    latitude,
    longitude,
    externalUrl,
  };
}

function unavailableRoute(mode: KakaoMapRouteMode): DepartureRoute {
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

async function fetchKakaoJson<T>(
  endpoint: string,
  parameters: Record<string, string>,
): Promise<T> {
  const apiKey = process.env.KAKAO_REST_API_KEY?.trim();
  if (!apiKey) {
    throw new KakaoMapError(
      "KAKAO_REST_API_KEY 환경변수가 설정되지 않았습니다.",
      "kakao_map_not_configured",
    );
  }

  const url = new URL(endpoint);
  url.search = new URLSearchParams(parameters).toString();
  let response: Response;

  try {
    response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(KAKAO_REQUEST_TIMEOUT_MS),
      headers: {
        Accept: "application/json",
        Authorization: `KakaoAK ${apiKey}`,
      },
    });
  } catch (error) {
    throw new KakaoMapError(
      error instanceof Error && error.name === "TimeoutError"
        ? "카카오맵 응답 시간이 초과되었습니다."
        : "카카오맵에 연결하지 못했습니다.",
      "kakao_map_unavailable",
    );
  }

  if (!response.ok) {
    throw new KakaoMapError(
      `카카오맵이 HTTP ${response.status} 응답을 반환했습니다.`,
      "kakao_map_http_error",
      response.status,
    );
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new KakaoMapError(
      "카카오맵 응답을 JSON으로 해석하지 못했습니다.",
      "kakao_map_invalid_response",
    );
  }
}

function finiteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cleanText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol === "http:") url.protocol = "https:";
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
