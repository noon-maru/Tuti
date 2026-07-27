const TOUR_API_BASE_URL =
  "https://apis.data.go.kr/B551011/KorService2";
const TOUR_API_SUCCESS_CODE = "0000";

export type TourApiPlaceItem = {
  contentid?: string;
  contenttypeid?: string;
  title?: string;
  addr1?: string;
  addr2?: string;
  areacode?: string;
  sigungucode?: string;
  cat1?: string;
  cat2?: string;
  cat3?: string;
  firstimage?: string;
  firstimage2?: string;
  mapx?: string;
  mapy?: string;
  mlevel?: string;
  modifiedtime?: string;
  cpyrhtDivCd?: string;
  tel?: string;
  zipcode?: string;
};

export type TourApiPage = {
  items: TourApiPlaceItem[];
  pageNo: number;
  numOfRows: number;
  totalCount: number;
};

type FetchAreaBasedPlacesInput = {
  pageNo: number;
  numOfRows: number;
  contentTypeId?: string;
};

type TourApiResponse = {
  response?: {
    header?: {
      resultCode?: string;
      resultMsg?: string;
    };
    body?: {
      items?: {
        item?: TourApiPlaceItem | TourApiPlaceItem[];
      };
      pageNo?: number | string;
      numOfRows?: number | string;
      totalCount?: number | string;
    };
  };
};

export class TourApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "TourApiError";
  }
}

export async function fetchAreaBasedTourismPlaces({
  pageNo,
  numOfRows,
  contentTypeId,
}: FetchAreaBasedPlacesInput): Promise<TourApiPage> {
  const serviceKey = process.env.TOUR_API_SERVICE_KEY?.trim();

  if (!serviceKey) {
    throw new TourApiError(
      "TOUR_API_SERVICE_KEY 환경변수가 설정되지 않았습니다.",
      "tour_api_not_configured",
    );
  }

  const url = new URL(`${TOUR_API_BASE_URL}/areaBasedList2`);
  url.search = new URLSearchParams({
    serviceKey,
    MobileOS: "ETC",
    MobileApp: "Tuti",
    _type: "json",
    arrange: "A",
    pageNo: String(pageNo),
    numOfRows: String(numOfRows),
    ...(contentTypeId ? { contentTypeId } : {}),
  }).toString();

  let response: Response;

  try {
    response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
      headers: {
        Accept: "application/json",
      },
    });
  } catch (error) {
    throw new TourApiError(
      error instanceof Error && error.name === "TimeoutError"
        ? "TourAPI 응답 시간이 초과되었습니다."
        : "TourAPI에 연결하지 못했습니다.",
      "tour_api_unavailable",
    );
  }

  const text = await response.text();

  if (!response.ok) {
    throw new TourApiError(
      `TourAPI가 HTTP ${response.status} 응답을 반환했습니다.`,
      "tour_api_http_error",
    );
  }

  let payload: TourApiResponse;

  try {
    payload = JSON.parse(text) as TourApiResponse;
  } catch {
    throw new TourApiError(
      "TourAPI 응답을 JSON으로 해석하지 못했습니다. 인증키 상태를 확인해주세요.",
      "tour_api_invalid_response",
    );
  }

  const header = payload.response?.header;
  const body = payload.response?.body;

  if (header?.resultCode !== TOUR_API_SUCCESS_CODE || !body) {
    throw new TourApiError(
      header?.resultMsg
        ? `TourAPI 요청이 실패했습니다: ${header.resultMsg}`
        : "TourAPI 응답 형식을 확인하지 못했습니다.",
      header?.resultCode ?? "tour_api_invalid_response",
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
