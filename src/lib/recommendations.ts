import type { IntakeAnswers } from "@/shared/tuti/types";

export type StateFeature = {
  energy: "low" | "soft" | "open";
  movement: "near" | "short" | "half";
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
  crowdForecast?: CrowdForecast;
  distanceMeters?: number;
  fatigueScore?: number;
  reason?: string;
};

export type CrowdForecastSource = "live" | "cached" | "typical";

export type CrowdForecast = {
  level: "low" | "medium" | "high";
  source: CrowdForecastSource;
  /** 관광공사가 산출한 0~100 상대 집중률. 평시 기준에는 평균값을 담는다. */
  rate: number;
  /** 예측 대상 일자(YYYYMMDD). 평시 평균은 별도 날짜를 두지 않는다. */
  forecastDate?: string;
};

export function getCrowdForecastLevelLabel(level: CrowdForecast["level"]) {
  if (level === "low") return "여유";
  if (level === "high") return "혼잡";
  return "보통";
}

export function getCrowdForecastBasisLabel(forecast: CrowdForecast) {
  if (forecast.source === "live") {
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
