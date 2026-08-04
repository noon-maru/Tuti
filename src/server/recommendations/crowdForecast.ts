import {
  type CrowdForecast,
  type TutiPlace,
} from "@/lib/recommendations";
import { prisma } from "@/server/db/prisma";
import {
  fetchTouristSpotConcentrationRates,
  type TouristSpotConcentrationItem,
} from "@/server/tourism/touristSpotConcentrationApiClient";
import { upsertTouristSpotConcentrationRate } from "@/server/tourism/syncTouristSpotConcentrationRates";
import {
  findSeoulRealtimeAreaContexts,
  resolveSeoulRealtimeCrowd,
} from "@/server/recommendations/seoulRealtimeCrowd";

const LIVE_REQUEST_TIMEOUT_MS = 4_000;
const RECENT_CACHE_MAX_AGE_MS = 48 * 60 * 60 * 1_000;
const MIN_TYPICAL_SAMPLE_SIZE = 3;

type TouristSpotContext = {
  areaCode: string;
  sigunguCode: string;
  touristSpotName: string;
};

/**
 * 관광공사 중심 관광지 원천 데이터와 이름이 일치하는 장소에만 집중률을 연결한다.
 * TourAPI 지역코드와 데이터랩 법정 코드 체계가 다르므로 두 코드를 직접 조인하지 않는다.
 */
export async function enrichPlacesWithCrowdForecast(
  places: TutiPlace[],
): Promise<TutiPlace[]> {
  const [contexts, seoulContexts] = await Promise.all([
    findTouristSpotContexts(places),
    findSeoulRealtimeAreaContexts(places),
  ]);

  return Promise.all(
    places.map(async (place) => {
      const seoulContext = seoulContexts.get(place.id);
      if (seoulContext) {
        const seoulForecast = await resolveSeoulRealtimeCrowd(seoulContext);
        if (seoulForecast) return applyCrowdForecast(place, seoulForecast);
      }

      const context = contexts.get(place.name);
      if (!context) return place;

      try {
        const forecast = await resolveCrowdForecast(context);
        return forecast ? applyCrowdForecast(place, forecast) : place;
      } catch {
        // 혼잡도 API나 보조 데이터가 불안정해도 기본 추천은 항상 제공한다.
        return place;
      }
    }),
  );
}

async function findTouristSpotContexts(places: TutiPlace[]) {
  const names = [...new Set(places.map((place) => place.name))];
  if (names.length === 0) return new Map<string, TouristSpotContext>();

  const records = await prisma.municipalCoreTourismSourceRecord.findMany({
    where: { touristSpotName: { in: names } },
    orderBy: [{ baseYm: "desc" }, { rank: "asc" }],
    select: {
      touristSpotName: true,
      areaCode: true,
      sigunguCode: true,
    },
  });
  const contexts = new Map<string, TouristSpotContext>();

  for (const record of records) {
    if (contexts.has(record.touristSpotName)) continue;
    contexts.set(record.touristSpotName, {
      areaCode: record.areaCode,
      sigunguCode: record.sigunguCode,
      touristSpotName: record.touristSpotName,
    });
  }

  return contexts;
}

async function resolveCrowdForecast(
  context: TouristSpotContext,
): Promise<CrowdForecast | null> {
  const today = getKoreanDateKey();

  try {
    const page = await fetchTouristSpotConcentrationRates({
      ...context,
      pageNo: 1,
      numOfRows: 100,
      timeoutMs: LIVE_REQUEST_TIMEOUT_MS,
    });
    const liveItems = page.items.filter((item) => isSameTouristSpot(item, context));

    await Promise.all(
      liveItems.map((item) => upsertTouristSpotConcentrationRate(item)),
    );

    const liveItem = selectClosestPrediction(liveItems, today);
    const liveRate = toRate(liveItem?.cnctrRate);

    if (liveItem?.baseYmd && liveRate !== null) {
      return toCrowdForecast("live", liveRate, liveItem.baseYmd);
    }
  } catch {
    // 최근 저장 예측값과 평시 예상값을 순서대로 시도한다.
  }

  const recent = await findRecentForecast(context, today);
  if (recent) return recent;

  return findTypicalForecast(context, today);
}

async function findRecentForecast(
  context: TouristSpotContext,
  today: string,
): Promise<CrowdForecast | null> {
  const records = await prisma.touristSpotConcentrationRateRecord.findMany({
    where: {
      ...context,
      syncedAt: { gte: new Date(Date.now() - RECENT_CACHE_MAX_AGE_MS) },
    },
    orderBy: [{ baseYmd: "asc" }, { syncedAt: "desc" }],
    take: 31,
  });
  const record = selectClosestPrediction(records, today);

  return record
    ? toCrowdForecast("cached", Number(record.concentrationRate), record.baseYmd)
    : null;
}

async function findTypicalForecast(
  context: TouristSpotContext,
  today: string,
): Promise<CrowdForecast | null> {
  const records = await prisma.touristSpotConcentrationRateRecord.findMany({
    where: context,
    orderBy: { baseYmd: "desc" },
    take: 180,
    select: { baseYmd: true, concentrationRate: true },
  });
  const weekday = weekdayOf(today);
  const rates = records
    .filter((record) => weekdayOf(record.baseYmd) === weekday)
    .map((record) => Number(record.concentrationRate))
    .filter(Number.isFinite)
    .slice(0, 12);

  if (rates.length < MIN_TYPICAL_SAMPLE_SIZE) return null;

  return toCrowdForecast(
    "typical",
    rates.reduce((sum, rate) => sum + rate, 0) / rates.length,
  );
}

function applyCrowdForecast(place: TutiPlace, forecast: CrowdForecast): TutiPlace {
  return {
    ...place,
    crowd: forecast.label ?? crowdTextForLevel(forecast.level),
    crowdForecast: forecast,
  };
}

function toCrowdForecast(
  source: CrowdForecast["source"],
  rate: number,
  forecastDate?: string,
): CrowdForecast {
  return {
    provider: "kto_concentration",
    source,
    level: rate <= 35 ? "low" : rate <= 70 ? "medium" : "high",
    rate: Math.round(rate * 10) / 10,
    ...(forecastDate ? { forecastDate } : {}),
  };
}

function crowdTextForLevel(level: CrowdForecast["level"]) {
  if (level === "low") return "낮음";
  if (level === "high") return "높음";
  return "보통";
}

function isSameTouristSpot(
  item: TouristSpotConcentrationItem,
  context: TouristSpotContext,
) {
  return (
    item.areaCd?.trim() === context.areaCode &&
    item.signguCd?.trim() === context.sigunguCode &&
    item.tAtsNm?.trim() === context.touristSpotName
  );
}

function selectClosestPrediction<T extends { baseYmd?: string }>(
  records: T[],
  targetDate: string,
) {
  return [...records]
    .filter((record) => /^\d{8}$/.test(record.baseYmd ?? ""))
    .sort((a, b) => {
      const aDistance = Math.abs(dateTimestamp(a.baseYmd ?? "") - dateTimestamp(targetDate));
      const bDistance = Math.abs(dateTimestamp(b.baseYmd ?? "") - dateTimestamp(targetDate));
      return aDistance - bDistance || (a.baseYmd ?? "").localeCompare(b.baseYmd ?? "");
    })[0];
}

function toRate(value: string | undefined) {
  const rate = Number(value);
  return Number.isFinite(rate) ? rate : null;
}

function getKoreanDateKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${value("year")}${value("month")}${value("day")}`;
}

function weekdayOf(value: string) {
  return Number.isNaN(dateTimestamp(value))
    ? -1
    : new Date(dateTimestamp(value)).getUTCDay();
}

function dateTimestamp(value: string) {
  if (!/^\d{8}$/.test(value)) return Number.NaN;
  return Date.UTC(
    Number(value.slice(0, 4)),
    Number(value.slice(4, 6)) - 1,
    Number(value.slice(6, 8)),
  );
}
