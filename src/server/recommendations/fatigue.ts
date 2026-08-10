import {
  interpretState,
  isRealtimeCrowdForecast,
  type RecommendationReasonFactor,
  type StateFeature,
  type TutiPlace,
} from "@/lib/recommendations";
import type {
  AirAnswer,
  DensityAnswer,
  IntakeAnswers,
  MovementAnswer,
} from "@/shared/tuti/types";

type MovementFatigueInput = Pick<
  TutiPlace,
  | "name"
  | "fatigue"
  | "movementLevel"
  | "moodTags"
  | "phrase"
  | "crowd"
  | "crowdForecast"
  | "distanceMeters"
  | "travelTimeSummary"
>;

export type FatigueBreakdown = {
  base: number;
  physicalDistance: number;
  travelTime: number;
  movementPenalty: number;
  moodAdjustment: number;
  crowdPenalty: number;
  energyPenalty: number;
};

type CrowdLevel = "low" | "medium" | "high" | "unknown";

type ReasonCandidate = {
  factor: RecommendationReasonFactor;
  score: number;
  headline: string;
  detail: string;
  cardPhrase: string;
};

const collectionDefaultPhrases = new Set([
  "잠깐 다른 공기를 만나기 좋은 곳",
  "천천히 둘러보며 다른 감각을 만나는 곳",
  "조금 더 길게 바깥의 흐름을 따라가는 날",
  "몸을 움직이며 공기를 바꿔보고 싶은 날",
]);

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
  limit = 6,
): TutiPlace[] {
  return places
    .map((place) => {
      const breakdown = calculateMovementFatigue(place, answers, feature);
      const fatigueScore = scoreBreakdown(breakdown);
      const explanation = getRecommendationExplanation(
        place,
        answers,
        breakdown,
        feature,
      );

      return {
        ...place,
        fatigueScore,
        reason: explanation.headline,
        reasonDetail: explanation.detail,
        reasonFactors: explanation.factors,
        cardPhrase: preferEditorialPhrase(place.phrase, explanation.cardPhrase),
      };
    })
    .sort((a, b) => a.fatigueScore - b.fatigueScore || a.fatigue - b.fatigue)
    .slice(0, limit);
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
    physicalDistance: place.travelTimeSummary
      ? 0
      : getPhysicalDistanceScore(place.distanceMeters, requestedMovement),
    travelTime: getTravelTimeScore(
      place.travelTimeSummary?.durationSeconds,
      requestedMovement,
    ),
    movementPenalty:
      movementGap > 0
        ? movementGap * 18
        : requestedMovement === place.movementLevel
          ? -6
          : -2,
    moodAdjustment: hasMoodMatch ? -12 : moodTag ? 6 : 0,
    crowdPenalty: getCrowdPenalty(
      place.crowd,
      density,
      place.moodTags,
      place.crowdForecast?.level,
    ),
    energyPenalty:
      feature.energy === "low" && place.fatigue > 38
        ? 12
        : feature.energy === "soft" && place.fatigue > 58
          ? 8
          : 0,
  };
}

export function scoreBreakdown(breakdown: FatigueBreakdown) {
  return Math.max(
    0,
      breakdown.base +
      breakdown.physicalDistance +
      breakdown.travelTime +
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
  forecastLevel?: Exclude<CrowdLevel, "unknown">,
) {
  const crowdLevel = normalizeCrowd(crowd, forecastLevel);

  if (crowdLevel === "unknown") return 0;

  if (density === "quiet" && moodTags.includes("solitude")) {
    if (crowdLevel === "low") return -8;
    return crowdLevel === "medium" ? 4 : 12;
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
    if (km < 1.5) return 8;
    if (km < 3) return 0;
    if (km <= 15) return -6;
    if (km <= 25) return 8;
    return 20;
  }

  if (km < 6) return 18;
  if (km < 12) return 6;
  if (km <= 45) return -8;
  if (km <= 70) return 5;
  return 18;
}

function getTravelTimeScore(
  durationSeconds: number | undefined,
  movement: MovementAnswer,
) {
  if (!durationSeconds) return 0;
  const minutes = durationSeconds / 60;

  if (movement === "near") {
    if (minutes <= 20) return -14;
    if (minutes <= 35) return 4;
    if (minutes <= 50) return 14;
    return 28;
  }

  if (movement === "short") {
    if (minutes < 10) return 12;
    if (minutes < 20) return 3;
    if (minutes <= 50) return -12;
    if (minutes <= 70) return 5;
    if (minutes <= 100) return 14;
    return 24;
  }

  if (minutes < 25) return 22;
  if (minutes < 45) return 8;
  if (minutes <= 100) return -16;
  if (minutes <= 130) return 5;
  if (minutes <= 180) return 14;
  return 26;
}

function normalizeCrowd(
  crowd: string,
  forecastLevel?: Exclude<CrowdLevel, "unknown">,
): CrowdLevel {
  if (forecastLevel) return forecastLevel;

  const normalized = crowd.trim().toLowerCase();

  if (
    !normalized ||
    /정보\s*없음|확인\s*(필요|중)|미확인|알\s*수\s*없/.test(normalized)
  ) {
    return "unknown";
  }

  if (
    crowd.includes("낮") ||
    crowd.includes("여유") ||
    normalized.includes("low")
  ) {
    return "low";
  }

  if (
    crowd.includes("높") ||
    crowd.includes("많") ||
    crowd.includes("붐") ||
    crowd.includes("혼잡") ||
    normalized.includes("high")
  ) {
    return "high";
  }

  if (
    crowd.includes("보통") ||
    crowd.includes("약간") ||
    normalized.includes("medium")
  ) {
    return "medium";
  }

  return "unknown";
}

function getRecommendationExplanation(
  place: MovementFatigueInput,
  answers: IntakeAnswers,
  breakdown: FatigueBreakdown,
  feature: StateFeature,
) {
  const candidates = [
    createDistanceReason(place, answers, feature),
    createCrowdReason(place, answers, breakdown),
    createMoodReason(place, answers, breakdown),
    createMovementReason(place, answers, feature, breakdown),
    createBurdenReason(place),
  ].filter((candidate): candidate is ReasonCandidate => candidate !== null);

  candidates.sort(
    (a, b) =>
      b.score - a.score || reasonPriority(a.factor) - reasonPriority(b.factor),
  );

  const primary = candidates[0] ?? {
    factor: "burden" as const,
    score: 0,
    headline: feature.burdenNote,
    detail: "오늘 답한 상태 안에서 준비와 이동 부담을 함께 낮췄어요.",
    cardPhrase: createFallbackCardPhrase(place),
  };
  const secondary = candidates.find(
    (candidate) =>
      candidate.factor !== primary.factor &&
      primary.score - candidate.score <= 5,
  );

  return {
    headline: primary.headline,
    detail: primary.detail,
    cardPhrase: createPlaceCharacterPhrase(place) ?? primary.cardPhrase,
    factors: secondary
      ? [primary.factor, secondary.factor]
      : [primary.factor],
  };
}

function createPlaceCharacterPhrase(place: MovementFatigueInput) {
  const name = place.name.trim();

  if (/도서관|책방|서점/.test(name)) {
    return pickPhrase(name, [
      "조용한 책장 사이에서 잠시 숨을 고르는 시간",
      "말없이 한 페이지쯤 머물고 싶은 날",
    ]);
  }

  if (/미술관|갤러리|전시|아트/.test(name)) {
    return pickPhrase(name, [
      "낯선 장면 앞에 잠시 멈추고 싶은 날",
      "천천히 시선을 옮기며 공기를 바꾸는 시간",
    ]);
  }

  if (/박물관|기념관|역사관|과학관/.test(name)) {
    return pickPhrase(name, [
      "천천히 이야기를 따라 걸어보고 싶은 날",
      "익숙한 하루 밖의 이야기를 만나보는 시간",
    ]);
  }

  if (/공원|정원|수목원|숲|휴양림/.test(name)) {
    return pickPhrase(name, [
      "바깥 공기를 천천히 걸어보고 싶은 날",
      "나무 사이로 잠깐 시야를 돌리는 시간",
    ]);
  }

  if (/바다|해변|해수욕장|호수|강|전망/.test(name)) {
    return pickPhrase(name, [
      "시야를 멀리 두고 잠시 머물고 싶은 날",
      "탁 트인 쪽으로 공기를 바꾸러 가는 시간",
    ]);
  }

  if (/시장|거리|골목|마을/.test(name)) {
    return pickPhrase(name, [
      "낯선 골목의 기척을 천천히 따라가는 날",
      "사람 사는 풍경 속을 가볍게 걸어보는 시간",
    ]);
  }

  if (/사찰|성당|교회|성지/.test(name)) {
    return pickPhrase(name, [
      "말이 적은 공간에서 잠시 머무는 시간",
      "조용한 풍경 속에서 호흡을 고르는 날",
    ]);
  }

  return null;
}

function pickPhrase(seed: string, phrases: readonly string[]) {
  const index = Array.from(seed).reduce(
    (total, character) => total + character.codePointAt(0)!,
    0,
  ) % phrases.length;

  return phrases[index];
}

function createDistanceReason(
  place: MovementFatigueInput,
  answers: IntakeAnswers,
  feature: StateFeature,
): ReasonCandidate | null {
  if (
    place.distanceMeters === undefined &&
    !place.travelTimeSummary?.durationSeconds
  ) {
    return null;
  }

  const travelMinutes = place.travelTimeSummary?.durationSeconds
    ? Math.round(place.travelTimeSummary.durationSeconds / 60)
    : null;

  if (travelMinutes !== null) {
    const preferred = isPreferredTravelTime(
      travelMinutes,
      feature.movement,
    );

    return {
      factor: "distance",
      score: preferred ? 42 : 20,
      headline:
        feature.movement === "half" && preferred
          ? "반나절의 여유로 닿기 좋은 거리예요."
          : feature.movement === "short" && preferred
            ? "짧게 다녀오기 좋은 이동 시간이에요."
            : feature.movement === "near" && preferred
              ? "지금 있는 곳에서 가볍게 닿을 수 있어요."
              : "오늘 정한 이동 범위 안에서 골랐어요.",
      detail: `대중교통 약 ${travelMinutes}분과 오늘 가능한 이동 범위를 함께 살폈어요.`,
      cardPhrase:
        feature.movement === "half"
          ? "조금 멀어져 다른 흐름을 만나보는 날"
          : feature.movement === "short"
            ? "잠깐 다녀오는 것만으로 충분한 날"
            : "오늘은 가까운 곳이면 충분할지도",
    };
  }

  const distanceMeters = place.distanceMeters;
  if (distanceMeters === undefined) return null;
  const preferredDistance = {
    near: 3_000,
    short: 8_000,
    half: 25_000,
  }[feature.movement];
  const ratio = distanceMeters / preferredDistance;
  if (ratio > 1) return null;

  return {
    factor: "distance",
    score: 28 + Math.round((1 - ratio) * 10),
    headline:
      distanceMeters <= 1_200
        ? "지금 위치에서 큰 이동 없이 닿을 수 있어요."
        : ratio <= 0.6
          ? "지금 위치에서 이동 부담이 낮은 쪽이에요."
          : answers.movement
            ? "오늘 정한 이동 범위 안에서 닿을 수 있어요."
            : "지금 위치에서 무리하지 않고 닿을 수 있는 범위예요.",
    detail: "도착하기 전부터 지치지 않도록 실제 이동 거리를 먼저 살폈어요.",
    cardPhrase:
      distanceMeters <= 1_200
        ? "오늘은 이 정도 거리면 충분할지도"
        : ratio <= 0.6
          ? "가까운 곳에서 잠깐 숨을 돌리고 싶은 날"
          : "오늘 닿을 수 있는 만큼만 다녀오는 날",
  };
}

function isPreferredTravelTime(
  minutes: number,
  movement: MovementAnswer,
) {
  if (movement === "near") return minutes <= 20;
  if (movement === "short") return minutes >= 20 && minutes <= 50;
  return minutes >= 45 && minutes <= 100;
}

function createCrowdReason(
  place: MovementFatigueInput,
  answers: IntakeAnswers,
  breakdown: FatigueBreakdown,
): ReasonCandidate | null {
  const crowdLevel = normalizeCrowd(
    place.crowd,
    place.crowdForecast?.level,
  );
  if (crowdLevel === "unknown" || breakdown.crowdPenalty >= 0) return null;

  const sourceBonus =
    place.crowdForecast?.source === "live"
      ? 5
      : place.crowdForecast?.source === "forecast"
        ? 3
        : place.crowdForecast?.source === "cached"
          ? 3
          : place.crowdForecast?.source === "typical"
            ? 1
            : 0;
  const detail = getCrowdReasonDetail(place.crowdForecast);

  return {
    factor: "crowd",
    score: 28 + Math.abs(breakdown.crowdPenalty) + sourceBonus,
    headline:
      answers.density === "quiet"
        ? "지금은 비교적 한적하게 머물 수 있는 쪽이에요."
        : answers.density === "lively"
          ? "사람들의 기척이 적당히 느껴지는 곳이에요."
          : "너무 조용하거나 붐비지 않는 쪽이에요.",
    detail,
    cardPhrase:
      answers.density === "quiet"
        ? "말하지 않고 머물러도 자연스러운 곳"
        : answers.density === "lively"
          ? "사람들 사이의 가벼운 온기가 필요한 날"
          : "적당한 기척 속에 잠시 머물기 좋은 곳",
  };
}

function getCrowdReasonDetail(forecast: TutiPlace["crowdForecast"]) {
  if (forecast && isRealtimeCrowdForecast(forecast)) {
    return "이동 부담과 지금 확인되는 혼잡도를 함께 살폈어요.";
  }
  if (forecast?.provider === "seoul_citydata") {
    return "이동 부담과 최근 확인된 혼잡도를 함께 살폈어요.";
  }
  if (
    forecast?.source === "forecast" ||
    forecast?.source === "live"
  ) {
    return "이동 부담과 오늘의 예상 혼잡도를 함께 살폈어요.";
  }
  if (forecast?.source === "cached") {
    return "이동 부담과 최근 예상 혼잡도를 함께 살폈어요.";
  }
  if (forecast?.source === "typical") {
    return "이동 부담과 평소 같은 요일의 예상 혼잡도를 함께 살폈어요.";
  }
  return "장소의 평소 혼잡 성격과 이동 부담을 함께 살폈어요.";
}

function createMoodReason(
  place: MovementFatigueInput,
  answers: IntakeAnswers,
  breakdown: FatigueBreakdown,
): ReasonCandidate | null {
  const moodTag = answers.air ? moodTagByAir[answers.air] : undefined;
  if (!moodTag || breakdown.moodAdjustment >= 0) return null;
  if (
    answers.air === "quiet" &&
    normalizeCrowd(place.crowd, place.crowdForecast?.level) === "high"
  ) {
    return null;
  }

  return {
    factor: "mood",
    score: 30 + Math.abs(breakdown.moodAdjustment) / 2,
    headline:
      answers.air === "open"
        ? "시야가 트인 공기를 만나기 좋은 쪽이에요."
        : answers.air === "walk"
          ? "천천히 걸으며 공기를 바꾸기 좋은 쪽이에요."
          : "말이 적은 공기 속에 머물기 좋은 쪽이에요.",
    detail: "오늘 원하는 공기와 장소의 성격이 맞는지를 먼저 살폈어요.",
    cardPhrase:
      answers.air === "open"
        ? "시야만 조금 멀어져도 괜찮은 날"
        : answers.air === "walk"
          ? "천천히 걷다 보면 공기가 달라지는 곳"
          : "조용한 공기 쪽으로 마음이 가는 날",
  };
}

function createMovementReason(
  place: MovementFatigueInput,
  answers: IntakeAnswers,
  feature: StateFeature,
  breakdown: FatigueBreakdown,
): ReasonCandidate | null {
  if (!answers.movement || breakdown.movementPenalty >= 0) return null;

  return {
    factor: "movement",
    score:
      20 + Math.abs(breakdown.movementPenalty) +
      (feature.energy === "low" ? 3 : 0),
    headline:
      place.movementLevel === "near"
        ? "오늘은 가까운 범위 안에서 골랐어요."
        : place.movementLevel === "half"
          ? "반나절 안에서 천천히 다녀올 수 있어요."
          : "짧게 다녀오기 좋은 움직임으로 골랐어요.",
    detail: "오늘 답한 이동 범위를 넘지 않도록 필요한 움직임을 맞췄어요.",
    cardPhrase:
      place.movementLevel === "near"
        ? "오늘은 가까운 곳이면 충분할지도"
        : place.movementLevel === "half"
          ? "조금 여유를 내어 오래 머물고 싶은 날"
          : "잠깐 다녀오는 것만으로 충분한 날",
  };
}

function createBurdenReason(
  place: MovementFatigueInput,
): ReasonCandidate | null {
  const highCrowd =
    normalizeCrowd(place.crowd, place.crowdForecast?.level) === "high";
  const headline = !highCrowd && place.moodTags.includes("solitude")
    ? "혼자 머물러도 자연스러운 성격의 공간이에요."
    : !highCrowd && place.moodTags.includes("quiet")
      ? "조용히 머물 수 있는 성격의 공간이에요."
      : place.moodTags.includes("walk")
        ? "천천히 걸으며 둘러보기 좋은 공간이에요."
        : place.moodTags.includes("open")
          ? "잠깐 시야를 바꾸기 좋은 성격의 공간이에요."
          : null;

  if (!headline) return null;

  return {
    factor: "burden",
    score: 14 + Math.max(0, 40 - place.fatigue) / 4,
    headline,
    detail: "장소 유형과 필요한 움직임을 기준으로 부담이 낮은 쪽을 골랐어요.",
    cardPhrase: createFallbackCardPhrase(place),
  };
}

function createFallbackCardPhrase(place: MovementFatigueInput) {
  if (place.moodTags.includes("solitude")) {
    return "혼자 머물러도 자연스러운 곳";
  }
  if (place.moodTags.includes("quiet")) {
    return "조용한 공기 속에 오래 머물고 싶은 날";
  }
  if (
    place.moodTags.includes("walk") &&
    place.moodTags.includes("open")
  ) {
    return "시야를 열어두고 천천히 걷는 시간";
  }
  if (place.moodTags.includes("walk")) {
    return "목적지보다 걷는 시간이 필요한 날";
  }
  if (place.moodTags.includes("open")) {
    return "시야만 조금 멀어져도 괜찮은 날";
  }
  return "같은 공기만 아니면 되는 날";
}

function preferEditorialPhrase(phrase: string, generatedPhrase: string) {
  const normalized = phrase.trim();
  if (normalized && !collectionDefaultPhrases.has(normalized)) {
    return normalized;
  }

  return generatedPhrase;
}

function reasonPriority(factor: RecommendationReasonFactor) {
  return {
    crowd: 0,
    distance: 1,
    mood: 2,
    movement: 3,
    burden: 4,
  }[factor];
}
