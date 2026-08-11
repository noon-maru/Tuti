const REGIONAL_VISITOR_COUNT_API_BASE_URL =
  "https://apis.data.go.kr/B551011/DataLabService";
const REGIONAL_VISITOR_COUNT_API_SUCCESS_CODES = new Set(["00", "0000"]);

export type VisitorAggregationLevel = "metropolitan" | "municipal";

export type RegionalVisitorCountItem = {
  baseYmd?: string;
  areaCode?: string;
  areaNm?: string;
  signguCode?: string;
  signguNm?: string;
  daywkDivCd?: string;
  daywkDivNm?: string;
  touDivCd?: string;
  touDivNm?: string;
  touNum?: string;
};

export type RegionalVisitorCountPage = {
  items: RegionalVisitorCountItem[];
  pageNo: number;
  numOfRows: number;
  totalCount: number;
};

export type FetchRegionalVisitorCountInput = {
  aggregationLevel: VisitorAggregationLevel;
  baseYmd: string;
  pageNo: number;
  numOfRows: number;
};

type RegionalVisitorCountApiEnvelope = {
  header?: {
    resultCode?: string;
    resultMsg?: string;
  };
  body?: {
    items?: {
      item?: RegionalVisitorCountItem | RegionalVisitorCountItem[];
    };
    pageNo?: number | string;
    numOfRows?: number | string;
    totalCount?: number | string;
  };
};

type RegionalVisitorCountApiResponse = RegionalVisitorCountApiEnvelope & {
  response?: RegionalVisitorCountApiEnvelope;
};

export class RegionalVisitorCountApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "RegionalVisitorCountApiError";
  }
}

export async function fetchRegionalVisitorCounts({
  aggregationLevel,
  baseYmd,
  pageNo,
  numOfRows,
}: FetchRegionalVisitorCountInput): Promise<RegionalVisitorCountPage> {
  const serviceKey =
    process.env.DATA_GO_KR_API_KEY?.trim();

  if (!serviceKey) {
    throw new RegionalVisitorCountApiError(
      "DATA_GO_KR_API_KEY 환경변수가 설정되지 않았습니다.",
      "regional_visitor_count_api_not_configured",
    );
  }

  const endpoint =
    aggregationLevel === "metropolitan"
      ? "metcoRegnVisitrDDList"
      : "locgoRegnVisitrDDList";
  const url = new URL(`${REGIONAL_VISITOR_COUNT_API_BASE_URL}/${endpoint}`);
  url.search = new URLSearchParams({
    serviceKey,
    MobileOS: "ETC",
    MobileApp: "Tuti",
    _type: "json",
    startYmd: baseYmd,
    endYmd: baseYmd,
    pageNo: String(pageNo),
    numOfRows: String(numOfRows),
  }).toString();

  let response: Response;

  try {
    response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    throw new RegionalVisitorCountApiError(
      error instanceof Error && error.name === "TimeoutError"
        ? "지역별 방문자 수 API 응답 시간이 초과되었습니다."
        : "지역별 방문자 수 API에 연결하지 못했습니다.",
      "regional_visitor_count_api_unavailable",
    );
  }

  const text = await response.text();

  if (!response.ok) {
    throw new RegionalVisitorCountApiError(
      response.status === 401 || response.status === 403
        ? "지역별 방문자 수 API 인증 또는 활용신청 상태를 확인해주세요."
        : `지역별 방문자 수 API가 HTTP ${response.status} 응답을 반환했습니다.`,
      "regional_visitor_count_api_http_error",
    );
  }

  let payload: RegionalVisitorCountApiResponse;

  try {
    payload = JSON.parse(text) as RegionalVisitorCountApiResponse;
  } catch {
    throw new RegionalVisitorCountApiError(
      "지역별 방문자 수 API 응답을 JSON으로 해석하지 못했습니다.",
      "regional_visitor_count_api_invalid_response",
    );
  }

  const envelope = payload.response ?? payload;
  const header = envelope.header;
  const body = envelope.body;

  if (
    !header?.resultCode ||
    !REGIONAL_VISITOR_COUNT_API_SUCCESS_CODES.has(header.resultCode) ||
    !body
  ) {
    throw new RegionalVisitorCountApiError(
      header?.resultMsg
        ? `지역별 방문자 수 API 요청이 실패했습니다: ${header.resultMsg}`
        : "지역별 방문자 수 API 응답 형식을 확인하지 못했습니다.",
      header?.resultCode ?? "regional_visitor_count_api_invalid_response",
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
