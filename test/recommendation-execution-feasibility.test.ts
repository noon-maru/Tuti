import assert from "node:assert/strict";
import test from "node:test";
import type { TutiPlace } from "@/lib/recommendations";
import { calculateExecutionFeasibility } from "@/server/recommendations/executionFeasibility";
import type { IntakeAnswers } from "@/shared/tuti/types";

function place(overrides: Partial<TutiPlace> = {}): TutiPlace {
  return {
    id: "place",
    name: "동네 공원",
    phrase: "",
    note: "",
    image: "",
    travelTime: "",
    crowd: "정보 없음",
    today: "",
    fatigue: 30,
    movementLevel: "near",
    moodTags: ["quiet", "walk"],
    sourceContentType: "12",
    experienceType: "forest_garden",
    travelTimeSummary: {
      mode: "walking",
      durationSeconds: 18 * 60,
      distanceMeters: 1_200,
      transfers: 0,
      walkingDistanceMeters: 1_200,
    },
    ...overrides,
  };
}

const nearAnswers: IntakeAnswers = {
  movement: "near",
  air: "quiet",
  density: "quiet",
};

test("한 시간 추천은 머무는 시간을 조절할 수 있는 공간에 20분 체류를 적용한다", () => {
  const feasibility = calculateExecutionFeasibility({
    place: place(),
    answers: nearAnswers,
    now: new Date("2026-09-16T01:00:00.000Z"),
  });

  assert.equal(feasibility?.minimumStayMinutes, 20);
  assert.equal(feasibility?.travelTimeVerified, true);
  assert.equal(feasibility?.totalMinutes, 56);
  assert.equal(feasibility?.fitsAvailableTime, true);
});

test("위치가 없어도 오늘 휴무인 장소는 실행 불가로 판정한다", () => {
  const feasibility = calculateExecutionFeasibility({
    place: place({ travelTimeSummary: undefined }),
    answers: nearAnswers,
    detail: {
      openingHours: "09:00~18:00",
      restDate: "매주 수요일",
      admissionFee: null,
    },
    // 2026-09-16은 수요일이다.
    now: new Date("2026-09-16T01:00:00.000Z"),
  });

  assert.equal(feasibility?.travelTimeVerified, false);
  assert.equal(feasibility?.operationStatus, "closed_today");
  assert.equal(feasibility?.fitsAvailableTime, false);
});

test("위치가 없고 운영 중이면 이동시간 적합성은 추정하지 않는다", () => {
  const feasibility = calculateExecutionFeasibility({
    place: place({ travelTimeSummary: undefined }),
    answers: nearAnswers,
    detail: {
      openingHours: "09:00~18:00",
      restDate: "연중무휴",
      admissionFee: null,
    },
    now: new Date("2026-09-16T01:00:00.000Z"),
  });

  assert.equal(feasibility?.travelTimeVerified, false);
  assert.equal(feasibility?.operationStatus, "available");
  assert.equal(feasibility?.fitsAvailableTime, true);
});

test("실제 경로 전에도 직선거리와 이동수단으로 왕복시간을 빠르게 추정한다", () => {
  const feasibility = calculateExecutionFeasibility({
    place: place({
      travelTimeSummary: undefined,
      distanceMeters: 5_000,
    }),
    answers: { movement: "short", transport: "car" },
    now: new Date("2026-09-16T01:00:00.000Z"),
  });

  assert.equal(feasibility?.travelTimeVerified, false);
  assert.equal(feasibility?.travelTimeEstimated, true);
  assert.ok((feasibility?.oneWayMinutes ?? 0) > 0);
  assert.ok((feasibility?.minimumTotalMinutes ?? 0) > 20);
  assert.equal(feasibility?.fitStatus, "comfortable");
});

test("구조화된 방문 프로필의 최소 체류시간을 사용한다", () => {
  const feasibility = calculateExecutionFeasibility({
    place: place({
      name: "작은 미술관",
      sourceContentType: "14",
      visitTimeProfile: {
        stayMinimumMinutes: 30,
        stayTypicalMinutes: 60,
        stayMaximumMinutes: 90,
        staySource: "llm_parsed",
        stayFlexibility: "flexible",
        parkingAvailability: "unknown",
        carSuitability: "possible",
        entryProcess: "open",
        reservationRequirement: "none",
        accessConstraint: "none",
        parkingBufferMinimumMinutes: 10,
        parkingBufferTypicalMinutes: 20,
        parkingBufferMaximumMinutes: 30,
        entryBufferMinimumMinutes: 0,
        entryBufferTypicalMinutes: 5,
        entryBufferMaximumMinutes: 10,
        confidence: 90,
        profileVersion: "test-v1",
      },
    }),
    answers: nearAnswers,
    detail: {
      openingHours: null,
      restDate: null,
      admissionFee: null,
    },
    now: new Date("2026-09-16T01:00:00.000Z"),
  });

  assert.equal(feasibility?.minimumStayMinutes, 30);
});

test("활동형 장소는 기본 최소 체류시간을 임의로 줄이지 않는다", () => {
  const feasibility = calculateExecutionFeasibility({
    place: place({ name: "강변 둘레길", experienceType: "activity" }),
    answers: nearAnswers,
    detail: {
      openingHours: null,
      restDate: null,
      admissionFee: null,
    },
    now: new Date("2026-09-16T01:00:00.000Z"),
  });

  assert.equal(feasibility?.minimumStayMinutes, 60);
  assert.equal(feasibility?.fitsAvailableTime, false);
});

test("자동차 접근 불가 장소는 자동차 추천에서만 실행 불가로 판정한다", () => {
  const restrictedPlace = place({
    visitTimeProfile: {
      stayMinimumMinutes: 20,
      stayTypicalMinutes: 40,
      stayMaximumMinutes: 60,
      staySource: "type_default",
      stayFlexibility: "flexible",
      parkingAvailability: "unknown",
      carSuitability: "unavailable",
      entryProcess: "open",
      reservationRequirement: "none",
      accessConstraint: "restricted",
      parkingBufferMinimumMinutes: 10,
      parkingBufferTypicalMinutes: 20,
      parkingBufferMaximumMinutes: 30,
      entryBufferMinimumMinutes: 0,
      entryBufferTypicalMinutes: 5,
      entryBufferMaximumMinutes: 10,
      confidence: 80,
      profileVersion: "test-v1",
    },
  });
  const carFeasibility = calculateExecutionFeasibility({
    place: restrictedPlace,
    answers: { movement: "short", transport: "car" },
    now: new Date("2026-09-16T01:00:00.000Z"),
  });
  const transitFeasibility = calculateExecutionFeasibility({
    place: restrictedPlace,
    answers: { movement: "short", transport: "transit" },
    now: new Date("2026-09-16T01:00:00.000Z"),
  });

  assert.equal(carFeasibility?.fitStatus, "impossible");
  assert.equal(carFeasibility?.fitsAvailableTime, false);
  assert.notEqual(transitFeasibility?.fitStatus, "impossible");
  assert.equal(transitFeasibility?.fitsAvailableTime, true);
});
