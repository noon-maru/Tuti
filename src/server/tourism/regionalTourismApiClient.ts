import { TourApiError } from "@/server/tourism/tourApiClient";

const RESOURCE_DEMAND_BASE_URL =
  "https://apis.data.go.kr/B551011/AreaTarResDemService";
const DEMAND_INTENSITY_BASE_URL =
  "https://apis.data.go.kr/B551011/AreaTarDemDsService";
const SUCCESS_CODE = "0000";

export type RegionalMetricType =
  | "serviceDemand"
  | "culturalResourceDemand"
  | "stayIntensity"
  | "consumptionIntensity";

export type RegionalMetricItem = {
  baseYm?: string;
  areaCd?: string;
  areaNm?: string;
  signguCd?: string;
  signguNm?: string;
  tarSvcDemIxCd?: string;
  tarSvcDemIxNm?: string;
  tarSvcDemIxVal?: string;
  culResDemIxCd?: string;
  culResDemIxNm?: string;
  culResDemIxVal?: string;
  tarSjrnDsIxCd?: string;
  tarSjrnDsIxNm?: string;
  tarSjrnDsIxVal?: string;
  tarExpDsIxCd?: string;
  tarExpDsIxNm?: string;
  tarExpDsIxVal?: string;
};

export type RegionalMetricPage = {
  items: RegionalMetricItem[];
  pageNo: number;
  numOfRows: number;
  totalCount: number;
};

type FetchRegionalMetricInput = {
  metricType: RegionalMetricType;
  metricCode: string;
  baseYm: string;
  areaCode: string;
  sigunguCode?: string;
  pageNo: number;
  numOfRows: number;
};

type RegionalApiResponse = {
  resultCode?: string;
  resultMsg?: string;
  response?: {
    header?: {
      resultCode?: string;
      resultMsg?: string;
    };
    body?: {
      items?:
        | string
        | {
            item?: RegionalMetricItem | RegionalMetricItem[];
          };
      pageNo?: number | string;
      numOfRows?: number | string;
      totalCount?: number | string;
    };
  };
};

const metricConfigs: Record<
  RegionalMetricType,
  {
    baseUrl: string;
    path: string;
    keyEnvironmentName:
      | "KTO_REGIONAL_RESOURCE_DEMAND_SERVICE_KEY"
      | "KTO_REGIONAL_DEMAND_INTENSITY_SERVICE_KEY";
    metricCodeParameter: string;
  }
> = {
  serviceDemand: {
    baseUrl: RESOURCE_DEMAND_BASE_URL,
    path: "areaTarSvcDemList",
    keyEnvironmentName: "KTO_REGIONAL_RESOURCE_DEMAND_SERVICE_KEY",
    metricCodeParameter: "tarSvcDemIxCd",
  },
  culturalResourceDemand: {
    baseUrl: RESOURCE_DEMAND_BASE_URL,
    path: "areaCulResDemList",
    keyEnvironmentName: "KTO_REGIONAL_RESOURCE_DEMAND_SERVICE_KEY",
    metricCodeParameter: "culResDemIxCd",
  },
  stayIntensity: {
    baseUrl: DEMAND_INTENSITY_BASE_URL,
    path: "areaTarSjrnDsList",
    keyEnvironmentName: "KTO_REGIONAL_DEMAND_INTENSITY_SERVICE_KEY",
    metricCodeParameter: "tarSjrnDsIxCd",
  },
  consumptionIntensity: {
    baseUrl: DEMAND_INTENSITY_BASE_URL,
    path: "areaTarExpDsList",
    keyEnvironmentName: "KTO_REGIONAL_DEMAND_INTENSITY_SERVICE_KEY",
    metricCodeParameter: "tarExpDsIxCd",
  },
};

export async function fetchRegionalTourismMetrics({
  metricType,
  metricCode,
  baseYm,
  areaCode,
  sigunguCode,
  pageNo,
  numOfRows,
}: FetchRegionalMetricInput): Promise<RegionalMetricPage> {
  const config = metricConfigs[metricType];
  const serviceKey = process.env[config.keyEnvironmentName]?.trim();

  if (!serviceKey) {
    throw new TourApiError(
      `${config.keyEnvironmentName} 환경변수가 설정되지 않았습니다.`,
      "tour_api_not_configured",
    );
  }

  const url = new URL(`${config.baseUrl}/${config.path}`);
  const searchParams = new URLSearchParams({
    serviceKey,
    MobileOS: "ETC",
    MobileApp: "Tuti",
    _type: "json",
    pageNo: String(pageNo),
    numOfRows: String(numOfRows),
    baseYm,
    areaCd: areaCode,
    [config.metricCodeParameter]: metricCode,
    ...(sigunguCode ? { signguCd: sigunguCode } : {}),
  });
  url.search = searchParams.toString();

  let response: Response;

  try {
    response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    throw new TourApiError(
      error instanceof Error && error.name === "TimeoutError"
        ? "지역 관광 데이터 응답 시간이 초과되었습니다."
        : "지역 관광 데이터 API에 연결하지 못했습니다.",
      "tour_api_unavailable",
    );
  }

  const text = await response.text();

  if (!response.ok) {
    throw new TourApiError(
      `지역 관광 데이터 API가 HTTP ${response.status} 응답을 반환했습니다.`,
      "tour_api_http_error",
    );
  }

  let payload: RegionalApiResponse;

  try {
    payload = JSON.parse(text) as RegionalApiResponse;
  } catch {
    throw new TourApiError(
      "지역 관광 데이터 응답을 JSON으로 해석하지 못했습니다.",
      "tour_api_invalid_response",
    );
  }

  const header = payload.response?.header;
  const body = payload.response?.body;
  const resultCode = header?.resultCode ?? payload.resultCode;
  const resultMessage = header?.resultMsg ?? payload.resultMsg;

  if (resultCode !== SUCCESS_CODE || !body) {
    throw new TourApiError(
      resultMessage
        ? `지역 관광 데이터 요청이 실패했습니다: ${resultMessage}`
        : "지역 관광 데이터 응답 형식을 확인하지 못했습니다.",
      resultCode ?? "tour_api_invalid_response",
    );
  }

  const item =
    typeof body.items === "object" ? body.items.item : undefined;

  return {
    items: Array.isArray(item) ? item : item ? [item] : [],
    pageNo: toFiniteNumber(body.pageNo, pageNo),
    numOfRows: toFiniteNumber(body.numOfRows, numOfRows),
    totalCount: toFiniteNumber(body.totalCount, 0),
  };
}

export function getRegionalMetricFields(
  metricType: RegionalMetricType,
  item: RegionalMetricItem,
) {
  if (metricType === "serviceDemand") {
    return {
      code: item.tarSvcDemIxCd,
      name: item.tarSvcDemIxNm,
      value: item.tarSvcDemIxVal,
    };
  }

  if (metricType === "culturalResourceDemand") {
    return {
      code: item.culResDemIxCd,
      name: item.culResDemIxNm,
      value: item.culResDemIxVal,
    };
  }

  if (metricType === "stayIntensity") {
    return {
      code: item.tarSjrnDsIxCd,
      name: item.tarSjrnDsIxNm,
      value: item.tarSjrnDsIxVal,
    };
  }

  return {
    code: item.tarExpDsIxCd,
    name: item.tarExpDsIxNm,
    value: item.tarExpDsIxVal,
  };
}

function toFiniteNumber(value: number | string | undefined, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
