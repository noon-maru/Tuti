const TOURIST_SPOT_CONCENTRATION_API_BASE_URL =
  "https://apis.data.go.kr/B551011/TatsCnctrRateService";
const TOURIST_SPOT_CONCENTRATION_API_SUCCESS_CODES = new Set(["00", "0000"]);

export type TouristSpotConcentrationItem = {
  baseYmd?: string;
  areaCd?: string;
  areaNm?: string;
  signguCd?: string;
  signguNm?: string;
  tAtsNm?: string;
  cnctrRate?: string;
};

export type TouristSpotConcentrationPage = {
  items: TouristSpotConcentrationItem[];
  pageNo: number;
  numOfRows: number;
  totalCount: number;
};

export type FetchTouristSpotConcentrationInput = {
  areaCode: string;
  sigunguCode: string;
  touristSpotName?: string;
  pageNo: number;
  numOfRows: number;
  timeoutMs?: number;
};

type TouristSpotConcentrationApiEnvelope = {
  header?: {
    resultCode?: string;
    resultMsg?: string;
  };
  body?: {
    items?: {
      item?: TouristSpotConcentrationItem | TouristSpotConcentrationItem[];
    };
    pageNo?: number | string;
    numOfRows?: number | string;
    totalCount?: number | string;
  };
};

type TouristSpotConcentrationApiResponse = TouristSpotConcentrationApiEnvelope & {
  response?: TouristSpotConcentrationApiEnvelope;
};

export class TouristSpotConcentrationApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "TouristSpotConcentrationApiError";
  }
}

export async function fetchTouristSpotConcentrationRates({
  areaCode,
  sigunguCode,
  touristSpotName,
  pageNo,
  numOfRows,
  timeoutMs = 20_000,
}: FetchTouristSpotConcentrationInput): Promise<TouristSpotConcentrationPage> {
  const serviceKey =
    process.env.DATA_GO_KR_API_KEY?.trim();

  if (!serviceKey) {
    throw new TouristSpotConcentrationApiError(
      "DATA_GO_KR_API_KEY 환경변수가 설정되지 않았습니다.",
      "tourist_spot_concentration_api_not_configured",
    );
  }

  const url = new URL(
    `${TOURIST_SPOT_CONCENTRATION_API_BASE_URL}/tatsCnctrRatedList`,
  );
  url.search = new URLSearchParams({
    serviceKey,
    MobileOS: "ETC",
    MobileApp: "Tuti",
    _type: "json",
    areaCd: areaCode,
    signguCd: sigunguCode,
    pageNo: String(pageNo),
    numOfRows: String(numOfRows),
    ...(touristSpotName ? { tAtsNm: touristSpotName } : {}),
  }).toString();

  let response: Response;

  try {
    response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    throw new TouristSpotConcentrationApiError(
      error instanceof Error && error.name === "TimeoutError"
        ? "관광지 집중률 API 응답 시간이 초과되었습니다."
        : "관광지 집중률 API에 연결하지 못했습니다.",
      "tourist_spot_concentration_api_unavailable",
    );
  }

  const text = await response.text();

  if (!response.ok) {
    throw new TouristSpotConcentrationApiError(
      response.status === 401 || response.status === 403
        ? "관광지 집중률 API 인증 또는 활용신청 상태를 확인해주세요."
        : `관광지 집중률 API가 HTTP ${response.status} 응답을 반환했습니다.`,
      "tourist_spot_concentration_api_http_error",
    );
  }

  let payload: TouristSpotConcentrationApiResponse;

  try {
    payload = JSON.parse(text) as TouristSpotConcentrationApiResponse;
  } catch {
    throw new TouristSpotConcentrationApiError(
      "관광지 집중률 API 응답을 JSON으로 해석하지 못했습니다.",
      "tourist_spot_concentration_api_invalid_response",
    );
  }

  const envelope = payload.response ?? payload;
  const header = envelope.header;
  const body = envelope.body;

  if (
    !header?.resultCode ||
    !TOURIST_SPOT_CONCENTRATION_API_SUCCESS_CODES.has(header.resultCode) ||
    !body
  ) {
    throw new TouristSpotConcentrationApiError(
      header?.resultMsg
        ? `관광지 집중률 API 요청이 실패했습니다: ${header.resultMsg}`
        : "관광지 집중률 API 응답 형식을 확인하지 못했습니다.",
      header?.resultCode ?? "tourist_spot_concentration_api_invalid_response",
    );
  }

  const item = body.items?.item;

  return {
    items: Array.isArray(item) ? item : item ? [item] : [],
    pageNo: toFiniteNumber(body.pageNo, pageNo),
    numOfRows: toFiniteNumber(body.numOfRows, numOfRows),
    totalCount: toFiniteNumber(body.totalCount, 0),
  };
}

function toFiniteNumber(value: number | string | undefined, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
