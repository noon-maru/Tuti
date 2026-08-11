const DATA_GO_TRANSPORT_TIMEOUT_MS = 15_000;
const TRAIN_INFO_BASE_URL = "https://apis.data.go.kr/1613000/TrainInfo";
const EXPRESS_BUS_INFO_BASE_URL = "https://apis.data.go.kr/1613000/ExpBusInfo";

type DataGoResponse<T> = {
  response?: {
    header?: { resultCode?: string; resultMsg?: string };
    body?: {
      items?: { item?: T | T[] };
      totalCount?: number | string;
    };
  };
};

export type TagoCity = {
  citycode?: string;
  cityname?: string;
  cityCode?: string;
  cityName?: string;
};
export type TagoVehicleKind = { vehiclekndid?: string; vehiclekndnm?: string };
export type TagoTrainStation = { nodeid?: string; nodename?: string };
export type TagoExpressBusTerminal = {
  nodeid?: string;
  nodename?: string;
  terminalId?: string;
  terminalNm?: string;
};

export type TagoScheduledService = {
  routeid?: string;
  trainno?: string | number;
  traingradename?: string;
  gradeNm?: string;
  depplacename?: string;
  arrplacename?: string;
  depplandtime?: string | number;
  arrplandtime?: string | number;
  adultcharge?: string | number;
  charge?: string | number;
  routeId?: string;
  depPlaceNm?: string;
  arrPlaceNm?: string;
  depPlandTime?: string | number;
  arrPlandTime?: string | number;
};

export class TagoTransportError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "TagoTransportError";
  }
}

export function fetchTrainCities() {
  return fetchTagoItems<TagoCity>(TRAIN_INFO_BASE_URL, "GetCtyCodeList");
}

export function fetchTrainStations(cityCode: string) {
  return fetchTagoItems<TagoTrainStation>(
    TRAIN_INFO_BASE_URL,
    "GetCtyAcctoTrainSttnList",
    { cityCode },
  );
}

export function fetchTrainVehicleKinds() {
  return fetchTagoItems<TagoVehicleKind>(
    TRAIN_INFO_BASE_URL,
    "GetVhcleKndList",
  );
}

export function fetchTrainSchedules(input: {
  departureStationId: string;
  arrivalStationId: string;
  departureDate: string;
  trainGradeCode?: string;
}) {
  return fetchTagoItems<TagoScheduledService>(
    TRAIN_INFO_BASE_URL,
    "GetStrtpntAlocFndTrainInfo",
    {
      depPlaceId: input.departureStationId,
      arrPlaceId: input.arrivalStationId,
      // TAGO 열차 API는 현재 요청일보다 하루 전의 운행편을 반환한다.
      // 실제 응답의 운행일은 추천 엔진에서 다시 검증한다.
      depPlandTime: addCalendarDays(input.departureDate, 1),
      ...(input.trainGradeCode
        ? { trainGradeCode: input.trainGradeCode }
        : {}),
      numOfRows: "200",
    },
  );
}

function addCalendarDays(dateKey: string, days: number) {
  if (!/^\d{8}$/.test(dateKey)) return dateKey;
  const date = new Date(
    `${dateKey.slice(0, 4)}-${dateKey.slice(4, 6)}-${dateKey.slice(6, 8)}T12:00:00Z`,
  );
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

export function fetchExpressBusCities() {
  return fetchTagoItems<TagoCity>(EXPRESS_BUS_INFO_BASE_URL, "GetCtyCodeList");
}

export function fetchExpressBusTerminals() {
  return fetchTagoItems<TagoExpressBusTerminal>(
    EXPRESS_BUS_INFO_BASE_URL,
    "GetExpBusTrminlList",
    { numOfRows: "1000" },
  );
}

export function fetchExpressBusSchedules(input: {
  departureTerminalId: string;
  arrivalTerminalId: string;
  departureDate: string;
  busGradeId?: string;
}) {
  return fetchTagoItems<TagoScheduledService>(
    EXPRESS_BUS_INFO_BASE_URL,
    "GetStrtpntAlocFndExpbusInfo",
    {
      depTerminalId: input.departureTerminalId,
      arrTerminalId: input.arrivalTerminalId,
      depPlandTime: input.departureDate,
      ...(input.busGradeId ? { busGradeId: input.busGradeId } : {}),
      numOfRows: "200",
    },
  );
}

async function fetchTagoItems<T>(
  baseUrl: string,
  operation: string,
  parameters: Record<string, string> = {},
) {
  const serviceKey = process.env.DATA_GO_KR_API_KEY?.trim();
  if (!serviceKey) {
    throw new TagoTransportError(
      "DATA_GO_KR_API_KEY 환경변수가 설정되지 않았습니다.",
      "tago_not_configured",
    );
  }

  const url = new URL(`${baseUrl}/${operation}`);
  url.search = new URLSearchParams({
    serviceKey,
    _type: "json",
    pageNo: "1",
    numOfRows: "100",
    ...parameters,
  }).toString();

  let response: Response;
  try {
    response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(DATA_GO_TRANSPORT_TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    throw new TagoTransportError(
      error instanceof Error && error.name === "TimeoutError"
        ? "교통정보 응답 시간이 초과되었습니다."
        : "교통정보 API에 연결하지 못했습니다.",
      "tago_unavailable",
    );
  }

  const text = await response.text();
  if (!response.ok) {
    throw new TagoTransportError(
      `교통정보 API가 HTTP ${response.status} 응답을 반환했습니다.`,
      response.status === 429 ? "tago_quota_exceeded" : "tago_http_error",
      response.status,
    );
  }

  let payload: DataGoResponse<T>;
  try {
    payload = JSON.parse(text) as DataGoResponse<T>;
  } catch {
    throw new TagoTransportError(
      "교통정보 응답을 JSON으로 해석하지 못했습니다.",
      "tago_invalid_response",
    );
  }

  const header = payload.response?.header;
  if (header?.resultCode !== "00" && header?.resultCode !== "0000") {
    throw new TagoTransportError(
      header?.resultMsg || "교통정보 API 요청이 실패했습니다.",
      header?.resultCode || "tago_invalid_response",
    );
  }

  const item = payload.response?.body?.items?.item;
  return Array.isArray(item) ? item : item ? [item] : [];
}
