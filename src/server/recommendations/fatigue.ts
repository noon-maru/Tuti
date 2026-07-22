import { interpretState, type StateFeature, type TutiPlace } from "@/lib/recommendations";
import type {
  AirAnswer,
  DensityAnswer,
  IntakeAnswers,
  MovementAnswer,
} from "@/shared/tuti/types";

type MovementFatigueInput = Pick<
  TutiPlace,
  "fatigue" | "movementLevel" | "moodTags" | "crowd" | "distanceMeters"
>;

type FatigueBreakdown = {
  base: number;
  physicalDistance: number;
  movementPenalty: number;
  moodAdjustment: number;
  crowdPenalty: number;
  energyPenalty: number;
};

const movementWeight: Record<MovementAnswer, number> = {
  near: 0,
  short: 1,
  half: 2,
};

const moodTagByAir: Record<AirAnswer, string> = {
  quiet: "quiet",
  open: "open",
  walk: "walk",
};

export function rankByMovementFatigue(
  places: TutiPlace[],
  answers: IntakeAnswers,
  feature: StateFeature = interpretState(answers),
): TutiPlace[] {
  return places
    .map((place) => {
      const breakdown = calculateMovementFatigue(place, answers, feature);
      const fatigueScore = scoreBreakdown(breakdown);

      return {
        ...place,
        fatigueScore,
        reason: getRecommendationReason(place, answers, breakdown, feature),
      };
    })
    .sort((a, b) => a.fatigueScore - b.fatigueScore || a.fatigue - b.fatigue)
    .slice(0, 6);
}

export function calculateMovementFatigue(
  place: MovementFatigueInput,
  answers: IntakeAnswers,
  feature: StateFeature = interpretState(answers),
): FatigueBreakdown {
  const requestedMovement = feature.movement;
  const requestedWeight = movementWeight[requestedMovement];
  const placeWeight = movementWeight[place.movementLevel];
  const movementGap = placeWeight - requestedWeight;
  const moodTag = answers.air ? moodTagByAir[answers.air] : undefined;
  const hasMoodMatch = moodTag ? place.moodTags.includes(moodTag) : false;
  const density = answers.density ?? "balanced";

  return {
    base: place.fatigue,
    physicalDistance: getPhysicalDistanceScore(place.distanceMeters, requestedMovement),
    movementPenalty:
      movementGap > 0
        ? movementGap * 18
        : requestedMovement === place.movementLevel
          ? -6
          : -2,
    moodAdjustment: hasMoodMatch ? -12 : moodTag ? 6 : 0,
    crowdPenalty: getCrowdPenalty(place.crowd, density, place.moodTags),
    energyPenalty:
      feature.energy === "low" && place.fatigue > 38
        ? 12
        : feature.energy === "soft" && place.fatigue > 58
          ? 8
          : 0,
  };
}

function scoreBreakdown(breakdown: FatigueBreakdown) {
  return Math.max(
    0,
    breakdown.base +
      breakdown.physicalDistance +
      breakdown.movementPenalty +
      breakdown.moodAdjustment +
      breakdown.crowdPenalty +
      breakdown.energyPenalty,
  );
}

function getCrowdPenalty(
  crowd: string,
  density: DensityAnswer,
  moodTags: string[],
) {
  const crowdLevel = normalizeCrowd(crowd);

  if (density === "quiet" && moodTags.includes("solitude")) {
    return crowdLevel === "low" ? -8 : -4;
  }

  if (density === "quiet") {
    if (crowdLevel === "low") return -4;
    if (crowdLevel === "medium") return 8;
    return 16;
  }

  if (density === "lively") {
    if (crowdLevel === "high") return -8;
    if (crowdLevel === "medium") return -4;
    return 10;
  }

  if (crowdLevel === "medium") return -6;
  return crowdLevel === "low" ? 2 : 4;
}

function getPhysicalDistanceScore(
  distanceMeters: number | undefined,
  movement: MovementAnswer,
) {
  if (distanceMeters === undefined) {
    return 0;
  }

  const km = distanceMeters / 1000;

  if (movement === "near") {
    if (km <= 1.2) return -10;
    if (km <= 3) return 0;
    if (km <= 7) return 14;
    return 28;
  }

  if (movement === "short") {
    if (km <= 3) return -6;
    if (km <= 8) return 0;
    if (km <= 18) return 10;
    return 22;
  }

  if (km <= 8) return -4;
  if (km <= 25) return 0;
  if (km <= 60) return 8;
  return 18;
}

function normalizeCrowd(crowd: string): "low" | "medium" | "high" {
  if (crowd.includes("낮") || crowd.toLowerCase().includes("low")) {
    return "low";
  }

  if (crowd.includes("높") || crowd.includes("많") || crowd.toLowerCase().includes("high")) {
    return "high";
  }

  return "medium";
}

function getRecommendationReason(
  place: MovementFatigueInput,
  answers: IntakeAnswers,
  breakdown: FatigueBreakdown,
  feature: StateFeature,
) {
  const moodTag = answers.air ? moodTagByAir[answers.air] : undefined;

  if (feature.energy === "low" && place.movementLevel === "near") {
    return "오늘은 가까운 쪽으로만 골랐어요.";
  }

  if (breakdown.physicalDistance < 0) {
    return "지금 위치에서 부담이 낮은 쪽이에요.";
  }

  if (answers.density === "quiet" && breakdown.crowdPenalty < 0) {
    return "혼자 있어도 덜 신경 쓰이는 곳이에요.";
  }

  if (answers.density === "lively" && breakdown.crowdPenalty < 0) {
    return "사람들의 온기가 가볍게 느껴지는 곳이에요.";
  }

  if (moodTag && place.moodTags.includes(moodTag)) {
    if (answers.air === "open") return "시야가 트인 곳부터 놓아둘게요.";
    if (answers.air === "walk") return "천천히 걸어도 되는 쪽이에요.";
    return "말이 적은 공기부터 골랐어요.";
  }

  if (breakdown.movementPenalty > 0) {
    return "조금 멀 수 있어서 천천히 봐도 괜찮아요.";
  }

  return feature.burdenNote;
}
