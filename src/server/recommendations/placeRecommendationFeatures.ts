import type { PlaceExperienceType } from "@/lib/recommendations";
import { assessPlaceExperienceType } from "@/server/recommendations/experienceType";
import { derivePlaceMoodTags } from "@/server/tourism/placeMoodTags";

export const PLACE_RECOMMENDATION_FEATURE_VERSION = "place-features-v1";

export type RecommendationFeatureSource = {
  name: string;
  address?: string | null;
  contentTypeId?: string | null;
  overview?: string | null;
  experienceGuide?: string | null;
  usageDuration?: string | null;
  reservation?: string | null;
};

export function derivePlaceRecommendationFeatures(source: RecommendationFeatureSource) {
  const moodTags = derivePlaceMoodTags(source);
  const experience = assessPlaceExperienceType({
    name: source.name,
    phrase: "",
    note: source.address ?? "",
    sourceContentType: source.contentTypeId ?? undefined,
    moodTags,
    overview: source.overview,
    experienceGuide: source.experienceGuide,
  });
  const duration = parseDurationMinutes(source.usageDuration);
  const burden = getActivityBurden(source, experience.type);
  const movementLevel: "near" | "short" | "half" =
    (duration !== null && duration >= 150) || burden >= 3
      ? "half"
      : duration !== null && duration <= 60 && burden === 0
        ? "near"
        : "short";
  const durationBurden = duration === null
    ? 8
    : duration <= 45
      ? 0
      : duration <= 90
        ? 7
        : duration <= 150
          ? 15
          : 24;
  const reservationBurden = /사전\s*예약|예약제|장비\s*대여/u.test(
    `${source.reservation ?? ""} ${source.experienceGuide ?? ""}`,
  ) ? 8 : 0;
  const restorativeRelief = moodTags.includes("quiet") ? 4 : 0;

  return {
    experienceType: experience.type,
    experienceTypeConfidence: experience.confidence,
    experienceTypeEvidence: experience.evidence,
    fatigue: clamp(22 + durationBurden + burden * 8 + reservationBurden - restorativeRelief, 16, 78),
    movementLevel,
    moodTags,
  };
}

function getActivityBurden(source: RecommendationFeatureSource, type: PlaceExperienceType) {
  const text = `${source.name} ${source.overview ?? ""} ${source.experienceGuide ?? ""}`;
  if (/패러글라이딩|래프팅|스키|스노보드|클라이밍|ATV|번지|승마/u.test(text)) return 4;
  if (/등산|트레킹|장거리|코스|체험|레저|캠핑|야영/u.test(text)) return 3;
  if (type === "activity") return 2;
  if (/둘레길|산책로|수목원|박물관|미술관|시장/u.test(text)) return 1;
  return 0;
}

function parseDurationMinutes(value?: string | null) {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, " ");
  const hours = [...normalized.matchAll(/(\d+(?:\.\d+)?)\s*시간/g)]
    .map((match) => Number(match[1]))
    .filter(Number.isFinite);
  const minutes = [...normalized.matchAll(/(\d+)\s*분/g)]
    .map((match) => Number(match[1]))
    .filter(Number.isFinite);
  if (hours.length === 0 && minutes.length === 0) return null;
  return Math.max(...hours.map((hour) => hour * 60), 0) + Math.max(...minutes, 0);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}
