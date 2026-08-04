const SEOUL_OPEN_API_BASE_URL = "http://openapi.seoul.go.kr:8088";
const SEOUL_REQUEST_TIMEOUT_MS = 8_000;

type SeoulPopulationForecastItem = {
  FCST_TIME?: string;
  FCST_CONGEST_LVL?: string;
  FCST_PPLTN_MIN?: string;
  FCST_PPLTN_MAX?: string;
};

type SeoulPopulationItem = {
  AREA_NM?: string;
  AREA_CD?: string;
  AREA_CONGEST_LVL?: string;
  AREA_CONGEST_MSG?: string;
  AREA_PPLTN_MIN?: string;
  AREA_PPLTN_MAX?: string;
  PPLTN_TIME?: string;
  FCST_YN?: string;
  FCST_PPLTN?: SeoulPopulationForecastItem[];
  [key: string]: unknown;
};

type SeoulPopulationResponse = {
  RESULT?: {
    "RESULT.CODE"?: string;
    "RESULT.MESSAGE"?: string;
  };
  "SeoulRtd.citydata_ppltn"?: SeoulPopulationItem[];
};

export type SeoulRealtimePopulation = {
  areaCode: string;
  areaName: string;
  congestionLevel: string;
  congestionMessage: string | null;
  populationMin: number | null;
  populationMax: number | null;
  observedAt: Date;
  forecasts: SeoulPopulationForecastItem[];
  rawPayload: SeoulPopulationItem;
};

export class SeoulRealtimePopulationError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "SeoulRealtimePopulationError";
  }
}

export async function fetchSeoulRealtimePopulation(
  areaCode: string,
): Promise<SeoulRealtimePopulation> {
  const apiKey = process.env.SEOUL_OPEN_DATA_API_KEY?.trim();
  if (!apiKey) {
    throw new SeoulRealtimePopulationError(
      "SEOUL_OPEN_DATA_API_KEY 환경변수가 설정되지 않았습니다.",
      "seoul_realtime_not_configured",
    );
  }

  const url = [
    SEOUL_OPEN_API_BASE_URL,
    encodeURIComponent(apiKey),
    "json",
    "citydata_ppltn",
    "1",
    "5",
    encodeURIComponent(areaCode),
  ].join("/");
  let response: Response;

  try {
    response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(SEOUL_REQUEST_TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    throw new SeoulRealtimePopulationError(
      error instanceof Error && error.name === "TimeoutError"
        ? "서울 실시간 인구데이터 응답 시간이 초과되었습니다."
        : "서울 실시간 인구데이터에 연결하지 못했습니다.",
      "seoul_realtime_unavailable",
    );
  }

  if (!response.ok) {
    throw new SeoulRealtimePopulationError(
      `서울 실시간 인구데이터가 HTTP ${response.status} 응답을 반환했습니다.`,
      "seoul_realtime_http_error",
      response.status,
    );
  }

  let payload: SeoulPopulationResponse;
  try {
    payload = (await response.json()) as SeoulPopulationResponse;
  } catch {
    throw new SeoulRealtimePopulationError(
      "서울 실시간 인구데이터 응답을 JSON으로 해석하지 못했습니다.",
      "seoul_realtime_invalid_response",
    );
  }

  const resultCode = payload.RESULT?.["RESULT.CODE"];
  const item = payload["SeoulRtd.citydata_ppltn"]?.[0];
  if (resultCode !== "INFO-000" || !item) {
    throw new SeoulRealtimePopulationError(
      payload.RESULT?.["RESULT.MESSAGE"] ??
        "서울 실시간 인구데이터가 빈 응답을 반환했습니다.",
      "seoul_realtime_api_error",
    );
  }

  const normalizedAreaCode = cleanText(item.AREA_CD);
  const areaName = cleanText(item.AREA_NM);
  const congestionLevel = cleanText(item.AREA_CONGEST_LVL);
  const observedAt = parseSeoulDateTime(item.PPLTN_TIME);

  if (
    !normalizedAreaCode ||
    !areaName ||
    !congestionLevel ||
    !observedAt
  ) {
    throw new SeoulRealtimePopulationError(
      "서울 실시간 인구데이터의 필수 필드가 비어 있습니다.",
      "seoul_realtime_invalid_item",
    );
  }

  return {
    areaCode: normalizedAreaCode,
    areaName,
    congestionLevel,
    congestionMessage: cleanText(item.AREA_CONGEST_MSG),
    populationMin: finiteInteger(item.AREA_PPLTN_MIN),
    populationMax: finiteInteger(item.AREA_PPLTN_MAX),
    observedAt,
    forecasts: Array.isArray(item.FCST_PPLTN) ? item.FCST_PPLTN : [],
    rawPayload: item,
  };
}

function parseSeoulDateTime(value: unknown) {
  const text = cleanText(value);
  if (!text || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(text)) {
    return null;
  }
  const date = new Date(`${text.replace(" ", "T")}:00+09:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function finiteInteger(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : null;
}

function cleanText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
