const WELLNESS_API_BASE_URL =
  "https://apis.data.go.kr/B551011/WellnessTursmService";
const WELLNESS_API_SUCCESS_CODES = new Set(["00", "0000"]);

export type WellnessTourismItem = {
  wellnessThemaCd?: string;
  langDivCd?: string;
  baseAddr?: string;
  detailAddr?: string;
  zipCd?: string;
  contentId?: string;
  contentTypeId?: string;
  regDt?: string;
  orgImage?: string;
  thumbImage?: string;
  cpyrhtDivCd?: string;
  mapX?: string;
  mapY?: string;
  mlevel?: string;
  mdfcnDt?: string;
  tel?: string;
  title?: string;
  lDongRegnCd?: string;
  lDongSignguCd?: string;
};

export type WellnessTourismPage = {
  items: WellnessTourismItem[];
  pageNo: number;
  numOfRows: number;
  totalCount: number;
};

export type FetchWellnessTourismInput = {
  pageNo: number;
  numOfRows: number;
  contentTypeId?: string;
  areaCode?: string;
  sigunguCode?: string;
  wellnessThemeCode?: string;
  modifiedDate?: string;
  language?: "KOR";
};

type WellnessApiEnvelope = {
  header?: {
    resultCode?: string;
    resultMsg?: string;
  };
  body?: {
    items?: {
      item?: WellnessTourismItem | WellnessTourismItem[];
    };
    pageNo?: number | string;
    numOfRows?: number | string;
    totalCount?: number | string;
  };
};

type WellnessApiResponse = WellnessApiEnvelope & {
  response?: WellnessApiEnvelope;
};

export class WellnessTourismApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "WellnessTourismApiError";
  }
}

export async function fetchWellnessTourismPlaces({
  pageNo,
  numOfRows,
  contentTypeId,
  areaCode,
  sigunguCode,
  wellnessThemeCode,
  modifiedDate,
  language = "KOR",
}: FetchWellnessTourismInput): Promise<WellnessTourismPage> {
  const serviceKey =
    process.env.DATA_GO_KR_API_KEY?.trim();

  if (!serviceKey) {
    throw new WellnessTourismApiError(
      "DATA_GO_KR_API_KEY 환경변수가 설정되지 않았습니다.",
      "wellness_api_not_configured",
    );
  }

  const url = new URL(`${WELLNESS_API_BASE_URL}/areaBasedList`);
  url.search = new URLSearchParams({
    serviceKey,
    MobileOS: "ETC",
    MobileApp: "Tuti",
    langDivCd: language,
    _type: "json",
    arrange: "A",
    pageNo: String(pageNo),
    numOfRows: String(numOfRows),
    ...(contentTypeId ? { contentTypeId } : {}),
    ...(areaCode ? { lDongRegnCd: areaCode } : {}),
    ...(areaCode && sigunguCode
      ? { lDongSignguCd: sigunguCode }
      : {}),
    ...(wellnessThemeCode ? { wellnessThemaCd: wellnessThemeCode } : {}),
    ...(modifiedDate ? { mdfcnDt: modifiedDate } : {}),
  }).toString();

  let response: Response;

  try {
    response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    throw new WellnessTourismApiError(
      error instanceof Error && error.name === "TimeoutError"
        ? "웰니스 관광정보 API 응답 시간이 초과되었습니다."
        : "웰니스 관광정보 API에 연결하지 못했습니다.",
      "wellness_api_unavailable",
    );
  }

  const text = await response.text();

  if (!response.ok) {
    const accessMessage =
      response.status === 401 || response.status === 403
        ? "웰니스 관광정보 API 인증 또는 활용신청 상태를 확인해주세요."
        : `웰니스 관광정보 API가 HTTP ${response.status} 응답을 반환했습니다.`;

    throw new WellnessTourismApiError(
      accessMessage,
      "wellness_api_http_error",
    );
  }

  let payload: WellnessApiResponse;

  try {
    payload = JSON.parse(text) as WellnessApiResponse;
  } catch {
    throw new WellnessTourismApiError(
      "웰니스 관광정보 API 응답을 JSON으로 해석하지 못했습니다.",
      "wellness_api_invalid_response",
    );
  }

  const envelope = payload.response ?? payload;
  const header = envelope.header;
  const body = envelope.body;

  if (
    !header?.resultCode ||
    !WELLNESS_API_SUCCESS_CODES.has(header.resultCode) ||
    !body
  ) {
    throw new WellnessTourismApiError(
      header?.resultMsg
        ? `웰니스 관광정보 API 요청이 실패했습니다: ${header.resultMsg}`
        : "웰니스 관광정보 API 응답 형식을 확인하지 못했습니다.",
      header?.resultCode ?? "wellness_api_invalid_response",
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
