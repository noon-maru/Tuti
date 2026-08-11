import type { IntakeAnswers } from "@/shared/tuti/types";
import type { TravelTimeSummary } from "@/shared/api/travelTime";

export type StateFeature = {
  energy: "low" | "soft" | "open";
  movement: "near" | "short" | "half" | "far";
  crowdTolerance: "low" | "medium" | "high";
  goal: "clear_air" | "quiet_reset" | "light_walk";
  burdenNote: string;
};

export type TutiPlace = {
  id: string;
  name: string;
  phrase: string;
  note: string;
  image: string;
  travelTime: string;
  crowd: string;
  today: string;
  fatigue: number;
  movementLevel: "near" | "short" | "half";
  moodTags: string[];
  sourceContentType?: string;
  latitude?: number;
  longitude?: number;
  travelTimeSummary?: TravelTimeSummary;
  crowdForecast?: CrowdForecast;
  distanceMeters?: number;
  fatigueScore?: number;
  reason?: string;
  reasonDetail?: string;
  reasonFactors?: RecommendationReasonFactor[];
  cardPhrase?: string;
  longDistanceJourney?: LongDistanceJourney;
};

export type LongDistanceMode = "highSpeedRail" | "expressBus";

export type LongDistanceHub = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
};

export type LongDistanceService = {
  serviceName: string;
  serviceNumber?: string;
  departureAt: string;
  arrivalAt: string;
  fareWon?: number;
};

export type LongDistanceJourney = {
  mode: LongDistanceMode;
  originHub: LongDistanceHub;
  destinationHub: LongDistanceHub;
  outbound: LongDistanceService;
  returnService: LongDistanceService;
  originAccess: TravelTimeSummary;
  destinationAccess: TravelTimeSummary;
  outboundDurationSeconds: number;
  totalFareWon?: number;
  bookingUrl: string;
};

export type RecommendationReasonFactor =
  | "distance"
  | "crowd"
  | "mood"
  | "movement"
  | "burden";

export type CrowdForecastSource = "live" | "forecast" | "cached" | "typical";
export type CrowdForecastProvider =
  | "seoul_citydata"
  | "kto_concentration"
  | "regional_visitors"
  | "tuti_estimate";

export type CrowdForecast = {
  level: "low" | "medium" | "high";
  source: CrowdForecastSource;
  provider?: CrowdForecastProvider;
  /** 혼잡 부담을 비교하기 위한 0~100 값. 관광공사 데이터에는 원래 집중률을 담는다. */
  rate: number;
  /** 원천에서 제공한 혼잡도 표현. 없으면 level을 한국어로 변환한다. */
  label?: string;
  /** 영역 단위 데이터인 경우 적용한 영역명. */
  areaName?: string;
  /** 실시간 또는 최근 데이터의 원천 측정 시각. */
  observedAt?: string;
  /** 원천이 제공한 혼잡도 안내 문구. */
  message?: string;
  /** 예측 대상 일자(YYYYMMDD). 평시 평균은 별도 날짜를 두지 않는다. */
  forecastDate?: string;
  /** 추정 데이터의 내부 신뢰도. */
  confidence?: "high" | "medium" | "low";
};

export function getCrowdForecastLevelLabel(
  value: CrowdForecast | CrowdForecast["level"],
) {
  if (typeof value !== "string" && value.label) return value.label;
  const level = typeof value === "string" ? value : value.level;
  if (level === "low") return "여유";
  if (level === "high") return "혼잡";
  return "보통";
}

export function getCrowdForecastKindLabel(forecast: CrowdForecast) {
  if (forecast.provider === "seoul_citydata") {
    return forecast.source === "live" ? "실시간 혼잡도" : "최근 혼잡도";
  }

  return "예상 혼잡도";
}

export function isRealtimeCrowdForecast(forecast: CrowdForecast) {
  return (
    forecast.provider === "seoul_citydata" && forecast.source === "live"
  );
}

export function getCrowdForecastBasisLabel(forecast: CrowdForecast) {
  if (forecast.provider === "seoul_citydata") {
    const area = forecast.areaName ?? "서울 주요 장소";
    if (forecast.source === "live") {
      return forecast.observedAt
        ? `${area} 실시간 · ${formatObservedTime(forecast.observedAt)}`
        : `${area} 실시간`;
    }
    return `${area} 최근 정보`;
  }

  if (forecast.provider === "tuti_estimate") {
    return "지역 방문 패턴 예상";
  }

  if (forecast.source === "forecast" || forecast.source === "live") {
    return forecast.forecastDate === getKoreanDateKey()
      ? "오늘 예측 기준"
      : `${formatForecastDate(forecast.forecastDate)} 예측 기준`;
  }

  if (forecast.source === "cached") return "최근 예측 기준";
  return "평시 예상 기준";
}

export function interpretState(answers: IntakeAnswers): StateFeature {
  const movement = answers.movement ?? "short";

  return {
    energy:
      movement === "near"
        ? "low"
        : movement === "short"
          ? "soft"
          : "open",
    movement,
    crowdTolerance:
      answers.density === "quiet"
        ? "low"
        : answers.density === "lively"
          ? "high"
          : "medium",
    goal:
      answers.air === "open"
        ? "clear_air"
        : answers.air === "walk"
          ? "light_walk"
          : "quiet_reset",
    burdenNote:
      answers.movement === "near"
        ? "오늘은 가까운 쪽으로만 골랐어요."
        : answers.movement === "far"
          ? "멀어도 가는 길이 단순한 곳으로 골랐어요."
        : "오늘 가능한 정도에 맞춰 가볍게 골랐어요.",
  };
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

function formatForecastDate(value?: string) {
  if (!value || !/^\d{8}$/.test(value)) return "최근";
  return `${value.slice(4, 6)}.${value.slice(6, 8)}`;
}

function formatObservedTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "최근 측정";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
