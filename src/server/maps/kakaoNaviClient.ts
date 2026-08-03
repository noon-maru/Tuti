import type {
  DepartureRoute,
  DepartureRouteStep,
} from "@/shared/api/departurePlan";
import type { UserLocation } from "@/shared/tuti/types";

const KAKAO_NAVI_DIRECTIONS_URL =
  "https://apis-navi.kakaomobility.com/v1/directions";
const KAKAO_REQUEST_TIMEOUT_MS = 10_000;

type KakaoNaviInput = {
  origin: UserLocation;
  destination: UserLocation;
  destinationName: string;
};

type KakaoNaviGuide = {
  guidance?: string;
  name?: string;
  distance?: number;
  duration?: number;
};

type KakaoNaviSection = {
  guides?: KakaoNaviGuide[];
};

type KakaoNaviRoute = {
  result_code?: number;
  summary?: {
    distance?: number;
    duration?: number;
    fare?: { taxi?: number; toll?: number };
  };
  sections?: KakaoNaviSection[];
};

type KakaoNaviResponse = {
  routes?: KakaoNaviRoute[];
};

export class KakaoNaviError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "KakaoNaviError";
  }
}

export async function fetchKakaoDrivingRoute({
  origin,
  destination,
  destinationName,
}: KakaoNaviInput): Promise<DepartureRoute> {
  const apiKey = process.env.KAKAO_REST_API_KEY?.trim();
  if (!apiKey) {
    throw new KakaoNaviError(
      "KAKAO_REST_API_KEY 환경변수가 설정되지 않았습니다.",
      "kakao_navi_not_configured",
    );
  }

  const url = new URL(KAKAO_NAVI_DIRECTIONS_URL);
  url.search = new URLSearchParams({
    origin: `${origin.longitude},${origin.latitude},name=현재 위치`,
    destination: `${destination.longitude},${destination.latitude},name=${destinationName}`,
    priority: "RECOMMEND",
    alternatives: "false",
    road_details: "false",
    summary: "false",
  }).toString();
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
    throw new KakaoNaviError(
      error instanceof Error && error.name === "TimeoutError"
        ? "카카오내비 응답 시간이 초과되었습니다."
        : "카카오내비에 연결하지 못했습니다.",
      "kakao_navi_unavailable",
    );
  }

  if (!response.ok) {
    throw new KakaoNaviError(
      `카카오내비가 HTTP ${response.status} 응답을 반환했습니다.`,
      "kakao_navi_http_error",
      response.status,
    );
  }

  let payload: KakaoNaviResponse;
  try {
    payload = (await response.json()) as KakaoNaviResponse;
  } catch {
    throw new KakaoNaviError(
      "카카오내비 응답을 JSON으로 해석하지 못했습니다.",
      "kakao_navi_invalid_response",
    );
  }

  const route = payload.routes?.[0];
  if (!route || route.result_code !== 0 || !route.summary) {
    return unavailableDrivingRoute();
  }

  return {
    mode: "driving",
    status: "available",
    durationSeconds: finiteNumber(route.summary.duration),
    distanceMeters: finiteNumber(route.summary.distance),
    transfers: null,
    fareWon: null,
    tollWon: finiteNumber(route.summary.fare?.toll),
    taxiFareWon: finiteNumber(route.summary.fare?.taxi),
    externalUrl: createKakaoMapDrivingUrl(
      origin,
      destination,
      destinationName,
    ),
    steps: normalizeDrivingSteps(route.sections),
  };
}

function normalizeDrivingSteps(
  sections: KakaoNaviSection[] | undefined,
): DepartureRouteStep[] {
  if (!Array.isArray(sections)) return [];

  return sections.flatMap((section) =>
    (section.guides ?? []).flatMap((guide) => {
      const guidance = cleanText(guide.guidance ?? guide.name);
      if (!guidance) return [];
      return [
        {
          guidance,
          durationSeconds: finiteNumber(guide.duration),
          distanceMeters: finiteNumber(guide.distance),
          vehicle: null,
        },
      ];
    }),
  );
}

function unavailableDrivingRoute(): DepartureRoute {
  return {
    mode: "driving",
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

function createKakaoMapDrivingUrl(
  origin: UserLocation,
  destination: UserLocation,
  destinationName: string,
) {
  const from = encodeURIComponent(
    `현재 위치,${origin.latitude},${origin.longitude}`,
  );
  const to = encodeURIComponent(
    `${destinationName},${destination.latitude},${destination.longitude}`,
  );
  return `https://map.kakao.com/link/from/${from}/to/${to}`;
}

function finiteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cleanText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
