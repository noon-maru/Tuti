import assert from "node:assert/strict";
import test from "node:test";
import type { StateFeature, TutiPlace } from "@/lib/recommendations";
import {
  calculateMovementFatigue,
  rankByMovementFatigue,
  scoreBreakdown,
  type FatigueBreakdown,
} from "@/server/recommendations/fatigue";
import type { IntakeAnswers } from "@/shared/tuti/types";

const feature: StateFeature = {
  energy: "soft",
  movement: "short",
  crowdTolerance: "medium",
  goal: "quiet_reset",
  burdenNote: "부담이 낮은 곳을 골랐어요.",
};

const answers: IntakeAnswers = {
  movement: "short",
  air: "quiet",
  density: "balanced",
};

function createPlace(overrides: Partial<TutiPlace> = {}): TutiPlace {
  return {
    id: "place",
    name: "테스트 공간",
    phrase: "잠깐 머물기 좋은 곳",
    note: "",
    image: "",
    travelTime: "",
    crowd: "보통",
    today: "",
    fatigue: 50,
    movementLevel: "short",
    moodTags: ["quiet"],
    sourceContentType: "14",
    ...overrides,
  };
}

test("추천 점수는 모든 가중치를 합산하고 0 미만을 자른다", () => {
  const breakdown: FatigueBreakdown = {
    base: 50,
    physicalDistance: 3,
    travelTime: -4,
    movementPenalty: -6,
    moodAdjustment: -5,
    crowdPenalty: 2,
    energyPenalty: 1,
    executionPenalty: -10,
    transferPenalty: 2,
    walkingPenalty: 3,
    weatherPenalty: 4,
    companionPenalty: -8,
    budgetPenalty: -7,
  };

  assert.equal(scoreBreakdown(breakdown), 25);
  assert.equal(
    scoreBreakdown({ ...breakdown, base: -100 }),
    0,
  );
});

test("실행 불가와 나쁜 야외 날씨는 추천 부담을 높인다", () => {
  const place = createPlace({
    name: "테스트 공원",
    moodTags: ["open", "walk"],
    sourceContentType: "12",
    executionFeasibility: {
      availableMinutes: 120,
      oneWayMinutes: 30,
      roundTripMinutes: 60,
      minimumStayMinutes: 40,
      waitingMinutes: 0,
      totalMinutes: 100,
      fitsAvailableTime: false,
      operationStatus: "closed_today",
      arrivalAt: "2026-08-11T15:00:00+09:00",
      leaveAt: "2026-08-11T15:40:00+09:00",
      returnAt: "2026-08-11T16:10:00+09:00",
    },
    weatherForecast: {
      provider: "kma_vilage",
      forecastAt: "2026-08-11T15:00:00+09:00",
      issuedAt: "2026-08-11T14:00:00+09:00",
      precipitationProbability: 80,
      precipitationType: "rain",
      sky: "cloudy",
      suitability: "poor",
    },
  });
  const breakdown = calculateMovementFatigue(place, answers, feature);

  assert.equal(breakdown.executionPenalty, 36);
  assert.equal(breakdown.weatherPenalty, 24);
});

test("동행자와 무료 입장 조건이 맞는 장소를 먼저 정렬한다", () => {
  const conditionedAnswers: IntakeAnswers = {
    ...answers,
    companion: "family",
    budget: "free",
  };
  const freeFamilyPlace = createPlace({
    id: "free-family",
    name: "어린이 과학관",
    admissionFee: "무료",
  });
  const paidPlace = createPlace({
    id: "paid",
    name: "일반 전시관",
    admissionFee: "성인 25,000원",
  });
  const ranked = rankByMovementFatigue(
    [paidPlace, freeFamilyPlace],
    conditionedAnswers,
    feature,
    2,
  );
  const freeBreakdown = calculateMovementFatigue(
    freeFamilyPlace,
    conditionedAnswers,
    feature,
  );

  assert.equal(freeBreakdown.companionPenalty, -8);
  assert.equal(freeBreakdown.budgetPenalty, -12);
  assert.equal(ranked[0].id, "free-family");
  assert.ok(ranked[0].fatigueScore! < ranked[1].fatigueScore!);
});
