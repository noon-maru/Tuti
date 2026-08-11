const MUNICIPAL_CORE_API_BASE_URL =
  "https://apis.data.go.kr/B551011/LocgoHubTarService1";
const MUNICIPAL_CORE_API_SUCCESS_CODES = new Set(["00", "0000"]);

export type MunicipalCoreTourismItem = {
  baseYm?: string;
  areaCd?: string;
  areaNm?: string;
  signguCd?: string;
  signguNm?: string;
  hubTatsCd?: string;
  hubTatsNm?: string;
  hubRank?: string;
  hubCtgryLclsNm?: string;
  hubCtgryMclsNm?: string;
  mapX?: string;
  mapY?: string;
};

export type MunicipalCoreTourismPage = {
  items: MunicipalCoreTourismItem[];
  pageNo: number;
  numOfRows: number;
  totalCount: number;
};

export type FetchMunicipalCoreTourismInput = {
  baseYm: string;
  areaCode: string;
  sigunguCode: string;
  pageNo: number;
  numOfRows: number;
};

type MunicipalCoreApiEnvelope = {
  header?: {
    resultCode?: string;
    resultMsg?: string;
  };
  body?: {
    items?: {
      item?: MunicipalCoreTourismItem | MunicipalCoreTourismItem[];
    };
    pageNo?: number | string;
    numOfRows?: number | string;
    totalCount?: number | string;
  };
};

type MunicipalCoreApiResponse = MunicipalCoreApiEnvelope & {
  response?: MunicipalCoreApiEnvelope;
};

export class MunicipalCoreTourismApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "MunicipalCoreTourismApiError";
  }
}

export async function fetchMunicipalCoreTourism({
  baseYm,
  areaCode,
  sigunguCode,
  pageNo,
  numOfRows,
}: FetchMunicipalCoreTourismInput): Promise<MunicipalCoreTourismPage> {
  const serviceKey =
    process.env.DATA_GO_KR_API_KEY?.trim();

  if (!serviceKey) {
    throw new MunicipalCoreTourismApiError(
      "DATA_GO_KR_API_KEY 환경변수가 설정되지 않았습니다.",
      "municipal_core_api_not_configured",
    );
  }

  const url = new URL(`${MUNICIPAL_CORE_API_BASE_URL}/areaBasedList1`);
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
      signal: AbortSignal.timeout(20_000),
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    throw new MunicipalCoreTourismApiError(
      error instanceof Error && error.name === "TimeoutError"
        ? "기초지자체 중심 관광지 API 응답 시간이 초과되었습니다."
        : "기초지자체 중심 관광지 API에 연결하지 못했습니다.",
      "municipal_core_api_unavailable",
    );
  }

  const text = await response.text();

  if (!response.ok) {
    throw new MunicipalCoreTourismApiError(
      response.status === 401 || response.status === 403
        ? "기초지자체 중심 관광지 API 인증 또는 활용신청 상태를 확인해주세요."
        : `기초지자체 중심 관광지 API가 HTTP ${response.status} 응답을 반환했습니다.`,
      "municipal_core_api_http_error",
    );
  }

  let payload: MunicipalCoreApiResponse;

  try {
    payload = JSON.parse(text) as MunicipalCoreApiResponse;
  } catch {
    throw new MunicipalCoreTourismApiError(
      "기초지자체 중심 관광지 API 응답을 JSON으로 해석하지 못했습니다.",
      "municipal_core_api_invalid_response",
    );
  }

  const envelope = payload.response ?? payload;
  const header = envelope.header;
  const body = envelope.body;

  if (
    !header?.resultCode ||
    !MUNICIPAL_CORE_API_SUCCESS_CODES.has(header.resultCode) ||
    !body
  ) {
    throw new MunicipalCoreTourismApiError(
      header?.resultMsg
        ? `기초지자체 중심 관광지 API 요청이 실패했습니다: ${header.resultMsg}`
        : "기초지자체 중심 관광지 API 응답 형식을 확인하지 못했습니다.",
      header?.resultCode ?? "municipal_core_api_invalid_response",
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
