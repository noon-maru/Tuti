import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isIntakePreferenceCurrent, withDefaultIntakeAnswers } from "@/lib/intakePreferences";
import { getIntakeSteps } from "@/features/tuti/data/intakeSteps";
import { createJSONStorage } from "zustand/middleware";
import { useTutiStore } from "@/store/tuti";

test("신규·빈 답변은 한 시간 안에·차 없이를 기본 선택한다", () => {
  for (const answers of [undefined, {}, { movement: undefined, transport: undefined }]) {
    const result = withDefaultIntakeAnswers(answers);
    assert.equal(result.movement, "near");
    assert.equal(result.transport, "transit");
  }
});

test("이전 선택과 오늘 하루의 출발 시점은 기본값으로 덮어쓰지 않는다", () => {
  const saved = { movement: "far", transport: "car", longDistanceTiming: "overnight_trip", budget: "free" } as const;
  const result = withDefaultIntakeAnswers(saved);
  assert.equal(result.movement, saved.movement);
  assert.equal(result.transport, saved.transport);
  assert.equal(result.longDistanceTiming, saved.longDistanceTiming);
  assert.equal(result.budget, saved.budget);
  assert.equal(getIntakeSteps(result).at(-1)?.key, "longDistanceTiming");
  assert.equal(withDefaultIntakeAnswers({ movement: "half" }).transport, "transit");
});

test("다음 날에는 재질문하지 않고 한국 날짜 기준 7일째부터 확인한다", () => {
  const record = { effectiveDate: "2026-11-12", completedAt: "2026-11-11T23:00:00Z" };
  for (const date of ["2026-11-12", "2026-11-13", "2026-11-18"]) assert.equal(isIntakePreferenceCurrent(record, date), true);
  assert.equal(isIntakePreferenceCurrent(record, "2026-11-19"), false);
  assert.equal(isIntakePreferenceCurrent(record, "2026-11-11"), false);
  assert.equal(isIntakePreferenceCurrent(undefined, "2026-11-12"), false);
  assert.equal(isIntakePreferenceCurrent({ completedAt: "invalid" }, "2026-11-12"), false);
});

test("기존 저장 이력은 완료 시각의 한국 날짜를 사용하고 월·연도 경계를 넘는다", () => {
  const record = { completedAt: "2026-12-31T15:01:00Z" };
  assert.equal(isIntakePreferenceCurrent(record, "2027-01-07"), true);
  assert.equal(isIntakePreferenceCurrent(record, "2027-01-08"), false);
});

test("자동 질문에만 주간 정책을 사용하고 추천 캐시는 계속 당일 기준으로 구분한다", () => {
  const flow = readFileSync("src/features/tuti/flows/RecommendationsFlow.tsx", "utf8");
  const query = readFileSync("src/features/tuti/hooks/useTutiRecommendations.ts", "utf8");
  assert.ok(flow.includes("isIntakePreferenceCurrent(entryRecord, currentDate)"));
  assert.ok(flow.includes("dailyCheckInRequested ||"));
  assert.ok(query.includes("dailyRecommendation?.effectiveDate === recommendationDate"));
  assert.ok(query.includes("withDefaultIntakeAnswers(storedAnswers)"));
  assert.ok(!query.includes("skippedToday ? {}"));
});

test("질문 생략·초기화도 같은 기본 조건을 저장하고 기존 응답 재사용은 보존한다", () => {
  useTutiStore.persist.setOptions({ storage: createJSONStorage(() => ({ getItem: () => null, setItem() {}, removeItem() {} })) });
  for (const reset of ["resetAllData", "resetIntake"] as const) {
    useTutiStore.getState()[reset]();
    assert.equal(useTutiStore.getState().answers.movement, "near");
    assert.equal(useTutiStore.getState().answers.transport, "transit");
  }
  useTutiStore.getState().setAnswer("movement", "half");
  useTutiStore.getState().setAnswer("transport", "car");
  useTutiStore.getState().finishIntake("answered");
  useTutiStore.getState().completeDailyCheckIn("reused");
  assert.equal(useTutiStore.getState().answers.movement, "half");
  assert.equal(useTutiStore.getState().answers.transport, "car");
  useTutiStore.getState().finishIntake("skipped");
  assert.equal(useTutiStore.getState().answers.movement, "near");
  assert.equal(useTutiStore.getState().answers.transport, "transit");
  assert.equal(isIntakePreferenceCurrent(useTutiStore.getState().entryRecord), true);
});
