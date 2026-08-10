const RELATED_TOURISM_API_BASE_URL =
  "https://apis.data.go.kr/B551011/TarRlteTarService1";
const RELATED_TOURISM_API_SUCCESS_CODES = new Set(["00", "0000"]);

export type RelatedTourismItem = {
  baseYm?: string;
  tAtsCd?: string;
  tAtsNm?: string;
  areaCd?: string;
  areaNm?: string;
  signguCd?: string;
  signguNm?: string;
  rlteTatsCd?: string;
  rlteTatsNm?: string;
  rlteRegnCd?: string;
  rlteRegnNm?: string;
  rlteSignguCd?: string;
  rlteSignguNm?: string;
  rlteCtgryLclsNm?: string;
  rlteCtgryMclsNm?: string;
  rlteCtgrySclsNm?: string;
  rlteRank?: string;
};

export type RelatedTourismPage = {
  items: RelatedTourismItem[];
  pageNo: number;
  numOfRows: number;
  totalCount: number;
};

export type FetchRelatedTourismInput = {
  baseYm: string;
  areaCode: string;
  sigunguCode: string;
  pageNo: number;
  numOfRows: number;
  timeoutMs?: number;
};

type RelatedTourismApiEnvelope = {
  header?: {
    resultCode?: string;
    resultMsg?: string;
  };
  body?: {
    items?: {
      item?: RelatedTourismItem | RelatedTourismItem[];
    };
    pageNo?: number | string;
    numOfRows?: number | string;
    totalCount?: number | string;
  };
};

type RelatedTourismApiResponse = RelatedTourismApiEnvelope & {
  response?: RelatedTourismApiEnvelope;
};

export class RelatedTourismApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "RelatedTourismApiError";
  }
}

export async function fetchRelatedTourism({
  baseYm,
  areaCode,
  sigunguCode,
  pageNo,
  numOfRows,
  timeoutMs = 20_000,
}: FetchRelatedTourismInput): Promise<RelatedTourismPage> {
  const serviceKey = process.env.KTO_RELATED_TOURISM_SERVICE_KEY?.trim();

  if (!serviceKey) {
    throw new RelatedTourismApiError(
      "KTO_RELATED_TOURISM_SERVICE_KEY 환경변수가 설정되지 않았습니다.",
      "related_tourism_api_not_configured",
    );
  }

  const url = new URL(`${RELATED_TOURISM_API_BASE_URL}/areaBasedList1`);
  url.search = new URLSearchParams({
    serviceKey,
    MobileOS: "ETC",
    MobileApp: "Tuti",
    _type: "json",
    baseYm,
    areaCd: areaCode,
    signguCd: sigunguCode,
    pageNo: String(pageNo),
    numOfRows: String(numOfRows),
  }).toString();

  let response: Response;

  try {
    response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    throw new RelatedTourismApiError(
      error instanceof Error && error.name === "TimeoutError"
        ? "관광지별 연관 관광지 API 응답 시간이 초과되었습니다."
        : "관광지별 연관 관광지 API에 연결하지 못했습니다.",
      "related_tourism_api_unavailable",
    );
  }

  const text = await response.text();

  if (!response.ok) {
    throw new RelatedTourismApiError(
      response.status === 401 || response.status === 403
        ? "관광지별 연관 관광지 API 인증 또는 활용신청 상태를 확인해주세요."
        : `관광지별 연관 관광지 API가 HTTP ${response.status} 응답을 반환했습니다.`,
      "related_tourism_api_http_error",
    );
  }

  let payload: RelatedTourismApiResponse;

  try {
    payload = JSON.parse(text) as RelatedTourismApiResponse;
  } catch {
    throw new RelatedTourismApiError(
      "관광지별 연관 관광지 API 응답을 JSON으로 해석하지 못했습니다.",
      "related_tourism_api_invalid_response",
    );
  }

  const envelope = payload.response ?? payload;
  const header = envelope.header;
  const body = envelope.body;

  if (
    !header?.resultCode ||
    !RELATED_TOURISM_API_SUCCESS_CODES.has(header.resultCode) ||
    !body
  ) {
    throw new RelatedTourismApiError(
      header?.resultMsg
        ? `관광지별 연관 관광지 API 요청이 실패했습니다: ${header.resultMsg}`
        : "관광지별 연관 관광지 API 응답 형식을 확인하지 못했습니다.",
      header?.resultCode ?? "related_tourism_api_invalid_response",
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
