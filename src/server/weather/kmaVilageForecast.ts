import type { TutiPlace, WeatherForecast } from "@/lib/recommendations";

const KMA_FORECAST_URL =
  "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst";
const KOREA_TIME_ZONE = "Asia/Seoul";
const REQUEST_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 40 * 60 * 1_000;
const forecastCache = new Map<string, CachedForecast>();
const forecastRequests = new Map<string, Promise<KmaForecastSeries | null>>();
let providerUnavailableUntil = 0;

type CachedForecast = {
  expiresAt: number;
  value: KmaForecastSeries;
};

type KmaForecastItem = {
  baseDate?: string;
  baseTime?: string;
  category?: string;
  fcstDate?: string;
  fcstTime?: string;
  fcstValue?: string;
  nx?: number;
  ny?: number;
};

type KmaResponse = {
  response?: {
    header?: { resultCode?: string; resultMsg?: string };
    body?: {
      items?: { item?: KmaForecastItem | KmaForecastItem[] };
    };
  };
  OpenAPI_ServiceResponse?: {
    cmmMsgHeader?: { errMsg?: string; returnAuthMsg?: string };
  };
};

type KmaForecastSeries = {
  issuedAt: string;
  values: Map<string, Map<string, string>>;
};

export async function enrichPlacesWithWeatherForecast(
  places: TutiPlace[],
  now = new Date(),
) {
  if (!getServiceKey() || providerUnavailableUntil > Date.now()) return places;

  const contexts = places.flatMap((place) => {
    if (
      !Number.isFinite(place.latitude) ||
      !Number.isFinite(place.longitude)
    ) {
      return [];
    }
    const grid = toKmaGrid(place.latitude!, place.longitude!);
    const targetAt = getForecastTarget(place, now);
    return [{ place, grid, targetAt }];
  });
  const gridKeys = new Map(
    contexts.map((context) => [
      `${context.grid.nx},${context.grid.ny}`,
      context.grid,
    ]),
  );
  const seriesByGrid = new Map<string, KmaForecastSeries>();

  await mapWithConcurrency([...gridKeys.entries()], 4, async ([key, grid]) => {
    if (providerUnavailableUntil > Date.now()) return;
    const series = await fetchKmaForecast(grid, now).catch((error) => {
      providerUnavailableUntil = Date.now() + 5 * 60_000;
      console.warn("기상청 단기예보를 불러오지 못했습니다.", {
        grid: key,
        error: error instanceof Error ? error.name : "UnknownError",
      });
      return null;
    });
    if (series) seriesByGrid.set(key, series);
  });

  const forecastByPlaceId = new Map<string, WeatherForecast>();
  contexts.forEach(({ place, grid, targetAt }) => {
    const series = seriesByGrid.get(`${grid.nx},${grid.ny}`);
    const forecast = series
      ? selectForecast(series, targetAt)
      : null;
    if (forecast) forecastByPlaceId.set(place.id, forecast);
  });

  return places.map((place) => {
    const weatherForecast = forecastByPlaceId.get(place.id);
    return weatherForecast ? { ...place, weatherForecast } : place;
  });
}

async function fetchKmaForecast(
  grid: { nx: number; ny: number },
  now: Date,
) {
  const issue = getLatestForecastIssue(now);
  const cacheKey = `${grid.nx},${grid.ny}:${issue.baseDate}:${issue.baseTime}`;
  const cached = forecastCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached) forecastCache.delete(cacheKey);

  const existingRequest = forecastRequests.get(cacheKey);
  if (existingRequest) return existingRequest;

  const request = fetchKmaForecastOnce(grid, issue)
    .then((value) => {
      forecastCache.set(cacheKey, {
        value,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
      return value;
    })
    .finally(() => forecastRequests.delete(cacheKey));
  forecastRequests.set(cacheKey, request);
  return request;
}

async function fetchKmaForecastOnce(
  grid: { nx: number; ny: number },
  issue: { baseDate: string; baseTime: string },
): Promise<KmaForecastSeries> {
  const serviceKey = getServiceKey();
  if (!serviceKey) throw new KmaWeatherError("기상청 API 키가 없습니다.");

  const url = new URL(KMA_FORECAST_URL);
  url.search = new URLSearchParams({
    serviceKey,
    pageNo: "1",
    numOfRows: "1000",
    dataType: "JSON",
    base_date: issue.baseDate,
    base_time: issue.baseTime,
    nx: String(grid.nx),
    ny: String(grid.ny),
  }).toString();

  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { Accept: "application/json" },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new KmaWeatherError(`기상청 API가 HTTP ${response.status}를 반환했습니다.`);
  }

  let payload: KmaResponse;
  try {
    payload = JSON.parse(text) as KmaResponse;
  } catch {
    throw new KmaWeatherError("기상청 API 응답을 해석하지 못했습니다.");
  }
  const header = payload.response?.header;
  if (header?.resultCode !== "00") {
    throw new KmaWeatherError(
      header?.resultMsg ??
        payload.OpenAPI_ServiceResponse?.cmmMsgHeader?.returnAuthMsg ??
        payload.OpenAPI_ServiceResponse?.cmmMsgHeader?.errMsg ??
        "기상청 API 요청이 실패했습니다.",
    );
  }

  const rawItems = payload.response?.body?.items?.item;
  const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
  const values = new Map<string, Map<string, string>>();
  items.forEach((item) => {
    if (!item.fcstDate || !item.fcstTime || !item.category) return;
    const key = `${item.fcstDate}${item.fcstTime.padStart(4, "0")}`;
    const categories = values.get(key) ?? new Map<string, string>();
    categories.set(item.category, item.fcstValue ?? "");
    values.set(key, categories);
  });

  return {
    issuedAt: toKoreanIso(issue.baseDate, issue.baseTime),
    values,
  };
}

function selectForecast(series: KmaForecastSeries, targetAt: Date) {
  const targetKey = getKoreanDateTimeKey(targetAt);
  const selectedKey = [...series.values.keys()]
    .sort()
    .find((key) => key >= targetKey) ?? [...series.values.keys()].sort().at(-1);
  if (!selectedKey) return null;
  const categories = series.values.get(selectedKey);
  if (!categories) return null;

  const precipitationProbability = finiteNumber(categories.get("POP"));
  const precipitationType = toPrecipitationType(categories.get("PTY"));
  const temperatureCelsius = finiteNumber(categories.get("TMP"));
  const windSpeedMps = finiteNumber(categories.get("WSD"));
  const sky = toSky(categories.get("SKY"));

  return {
    provider: "kma_vilage",
    forecastAt: toKoreanIso(selectedKey.slice(0, 8), selectedKey.slice(8)),
    issuedAt: series.issuedAt,
    ...(temperatureCelsius !== undefined ? { temperatureCelsius } : {}),
    ...(precipitationProbability !== undefined
      ? { precipitationProbability }
      : {}),
    precipitationType,
    sky,
    ...(windSpeedMps !== undefined ? { windSpeedMps } : {}),
    suitability: getSuitability({
      precipitationProbability,
      precipitationType,
      temperatureCelsius,
      windSpeedMps,
    }),
  } satisfies WeatherForecast;
}

function getSuitability({
  precipitationProbability,
  precipitationType,
  temperatureCelsius,
  windSpeedMps,
}: {
  precipitationProbability?: number;
  precipitationType: WeatherForecast["precipitationType"];
  temperatureCelsius?: number;
  windSpeedMps?: number;
}): WeatherForecast["suitability"] {
  if (
    precipitationType !== "none" ||
    (precipitationProbability ?? 0) >= 60 ||
    (windSpeedMps ?? 0) >= 10 ||
    (temperatureCelsius !== undefined &&
      (temperatureCelsius <= -5 || temperatureCelsius >= 33))
  ) {
    return "poor";
  }
  if (
    (precipitationProbability ?? 0) >= 30 ||
    (windSpeedMps ?? 0) >= 7 ||
    (temperatureCelsius !== undefined &&
      (temperatureCelsius <= 0 || temperatureCelsius >= 30))
  ) {
    return "caution";
  }
  return "good";
}

function getForecastTarget(place: TutiPlace, now: Date) {
  if (place.longDistanceJourney) {
    return new Date(
      new Date(place.longDistanceJourney.outbound.arrivalAt).getTime() +
        place.longDistanceJourney.destinationAccess.durationSeconds * 1_000,
    );
  }
  if (place.executionFeasibility) {
    return new Date(place.executionFeasibility.arrivalAt);
  }
  const travelSeconds = place.travelTimeSummary?.durationSeconds ?? 60 * 60;
  return new Date(now.getTime() + travelSeconds * 1_000);
}

function getLatestForecastIssue(now: Date) {
  const delayed = new Date(now.getTime() - 15 * 60_000);
  const parts = getKoreanParts(delayed);
  const issueHours = [2, 5, 8, 11, 14, 17, 20, 23];
  const issueHour = [...issueHours].reverse().find((hour) => hour <= parts.hour);
  if (issueHour !== undefined) {
    return {
      baseDate: `${parts.year}${pad(parts.month)}${pad(parts.day)}`,
      baseTime: `${pad(issueHour)}00`,
    };
  }
  const previous = new Date(delayed.getTime() - 24 * 60 * 60_000);
  const previousParts = getKoreanParts(previous);
  return {
    baseDate: `${previousParts.year}${pad(previousParts.month)}${pad(previousParts.day)}`,
    baseTime: "2300",
  };
}

export function toKmaGrid(latitude: number, longitude: number) {
  const earthRadius = 6371.00877;
  const gridLength = 5;
  const standardLatitude1 = 30;
  const standardLatitude2 = 60;
  const originLongitude = 126;
  const originLatitude = 38;
  const originX = 43;
  const originY = 136;
  const radians = Math.PI / 180;
  const re = earthRadius / gridLength;
  const slat1 = standardLatitude1 * radians;
  const slat2 = standardLatitude2 * radians;
  const olon = originLongitude * radians;
  const olat = originLatitude * radians;
  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) /
    Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.cos(slat1) * sf ** sn) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / ro ** sn;
  let ra = Math.tan(Math.PI * 0.25 + latitude * radians * 0.5);
  ra = (re * sf) / ra ** sn;
  let theta = longitude * radians - olon;
  if (theta > Math.PI) theta -= 2 * Math.PI;
  if (theta < -Math.PI) theta += 2 * Math.PI;
  theta *= sn;
  return {
    nx: Math.floor(ra * Math.sin(theta) + originX + 0.5),
    ny: Math.floor(ro - ra * Math.cos(theta) + originY + 0.5),
  };
}

function getKoreanDateTimeKey(date: Date) {
  const parts = getKoreanParts(date);
  return `${parts.year}${pad(parts.month)}${pad(parts.day)}${pad(parts.hour)}00`;
}

function getKoreanParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: KOREA_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
  };
}

function toKoreanIso(date: string, time: string) {
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${time.slice(0, 2)}:${time.slice(2, 4)}:00+09:00`;
}

function finiteNumber(value: string | undefined) {
  if (value === undefined || value.trim() === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function toPrecipitationType(
  value: string | undefined,
): WeatherForecast["precipitationType"] {
  if (value === "1") return "rain";
  if (value === "2") return "rain_snow";
  if (value === "3") return "snow";
  if (value === "4") return "shower";
  return "none";
}

function toSky(value: string | undefined): WeatherForecast["sky"] {
  if (value === "1") return "clear";
  if (value === "3") return "partly_cloudy";
  if (value === "4") return "cloudy";
  return "unknown";
}

function getServiceKey() {
  return (
    process.env.KMA_WEATHER_API_KEY?.trim() ||
    process.env.DATA_GO_KR_API_KEY?.trim()
  );
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

async function mapWithConcurrency<Input>(
  items: Input[],
  concurrency: number,
  mapper: (item: Input) => Promise<void>,
) {
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await mapper(items[index]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, worker),
  );
}

class KmaWeatherError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KmaWeatherError";
  }
}
