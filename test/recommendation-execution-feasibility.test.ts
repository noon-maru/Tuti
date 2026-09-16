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
      usageDuration: "약 40분",
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
      usageDuration: "약 40분",
      admissionFee: null,
    },
    now: new Date("2026-09-16T01:00:00.000Z"),
  });

  assert.equal(feasibility?.travelTimeVerified, false);
  assert.equal(feasibility?.operationStatus, "available");
  assert.equal(feasibility?.fitsAvailableTime, true);
});

test("명시된 관람시간도 유연한 근거리 공간에서는 최대 25분으로 잡는다", () => {
  const feasibility = calculateExecutionFeasibility({
    place: place({ name: "작은 미술관", sourceContentType: "14" }),
    answers: nearAnswers,
    detail: {
      openingHours: null,
      restDate: null,
      usageDuration: "약 1시간",
      admissionFee: null,
    },
    now: new Date("2026-09-16T01:00:00.000Z"),
  });

  assert.equal(feasibility?.minimumStayMinutes, 25);
});

test("둘레길처럼 시간이 필요한 장소는 한 시간 추천에서도 체류시간을 줄이지 않는다", () => {
  const feasibility = calculateExecutionFeasibility({
    place: place({ name: "강변 둘레길" }),
    answers: nearAnswers,
    detail: {
      openingHours: null,
      restDate: null,
      usageDuration: "약 1시간",
      admissionFee: null,
    },
    now: new Date("2026-09-16T01:00:00.000Z"),
  });

  assert.equal(feasibility?.minimumStayMinutes, 60);
  assert.equal(feasibility?.fitsAvailableTime, false);
});
