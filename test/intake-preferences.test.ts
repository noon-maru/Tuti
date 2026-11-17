import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isIntakePreferenceCurrent, withDefaultIntakeAnswers } from "@/lib/intakePreferences";
import { getIntakeSteps } from "@/features/tuti/data/intakeSteps";
import { createJSONStorage } from "zustand/middleware";
import { useTutiStore } from "@/store/tuti";
import { getKoreanDateKeyAfterDays } from "@/lib/date/koreanDate";
import type { IntakeAnswers } from "@/shared/tuti/types";

test("신규·빈 답변은 한 시간 안에·차 없이를 기본 선택한다", () => {
  for (const answers of [undefined, {}, { movement: undefined, transport: undefined }]) {
    const result = withDefaultIntakeAnswers(answers);
    assert.equal(result.movement, "near");
    assert.equal(result.transport, "transit");
  }
});

test("이전 저장소의 알 수 없는 조건·잘못된 카테고리는 기본값으로 복구해 400 반복을 막는다", () => {
  for (const value of [null, [], "old", { movement: "old-movement", transport: "bus", petCompanion: "cat", budget: "unknown" }]) {
    const result = withDefaultIntakeAnswers(value as IntakeAnswers);
    assert.equal(result.petCompanion, "none");
    assert.equal(result.movement, "near");
    assert.equal(result.transport, "transit");
    assert.equal(result.budget, undefined);
  }
  const dog = withDefaultIntakeAnswers({ petCompanion: "dog", movement: "near", placeCategories: ["unknown"], longDistanceTiming: "overnight_trip" } as unknown as IntakeAnswers);
  assert.equal(dog.movement, "short");
  assert.deepEqual(dog.placeCategories, []);
  assert.equal(dog.longDistanceTiming, undefined);
});

test("실제 persist 복원에서 잘못된 질문 값을 정리하고 정상 추천·마디 맥락은 보존한다", async t => {
  const previous = useTutiStore.getState(), options = useTutiStore.persist.getOptions();
  t.after(() => { useTutiStore.setState(previous, true); useTutiStore.persist.setOptions(options); });
  const snapshot = { recommendationId: "keep-list" };
  for (const answers of [null, { petCompanion: "dog", movement: "near", transport: "invalid", placeCategories: ["unknown"] }]) {
    useTutiStore.persist.setOptions({ storage: createJSONStorage(() => ({
      getItem: () => JSON.stringify({ state: { answers, dailyRecommendation: snapshot, activePlaceId: "kept-card", pendingDeparture: { placeId: "pending" } }, version: 0 }),
      setItem() {}, removeItem() {},
    })) });
    await useTutiStore.persist.rehydrate();
    const state = useTutiStore.getState();
    assert.equal(state.answers.transport, "transit");
    assert.equal(state.answers.movement, answers ? "short" : "near");
    assert.equal(state.dailyRecommendation?.recommendationId, "keep-list");
    assert.equal(state.activePlaceId, "kept-card");
    assert.equal(state.pendingDeparture?.placeId, "pending");
  }
});

test("동반 기본값·기존 한 시간 선택은 한두 시간으로 보정하고 더 긴 선택과 비동반은 보존한다", () => {
  for (const movement of [undefined, "near"] as const) assert.equal(withDefaultIntakeAnswers({ petCompanion: "dog", movement }).movement, "short");
  for (const movement of ["short", "half", "far"] as const) assert.equal(withDefaultIntakeAnswers({ petCompanion: "dog", movement }).movement, movement);
  assert.equal(withDefaultIntakeAnswers({ petCompanion: "none", movement: "near" }).movement, "near");
  assert.equal(withDefaultIntakeAnswers({ movement: "near" }).movement, "near");
});

test("최초 질문 동반 선택과 주간 재질문 초안은 같은 시간 보정 규칙을 사용한다", () => {
  useTutiStore.persist.setOptions({ storage: createJSONStorage(() => ({ getItem: () => null, setItem() {}, removeItem() {} })) });
  useTutiStore.getState().resetAllData();
  useTutiStore.getState().setAnswer("petCompanion", "dog");
  assert.equal(useTutiStore.getState().answers.movement, "short");
  useTutiStore.getState().setAnswer("movement", "near");
  assert.equal(useTutiStore.getState().answers.movement, "short", "숨겨진 예전 값을 다시 넣어도 동반 한 시간으로 돌아가지 않는다");
  useTutiStore.getState().setAnswer("petCompanion", "none");
  useTutiStore.getState().setAnswer("movement", "near");
  assert.equal(useTutiStore.getState().answers.movement, "near");
  const weekly = readFileSync("src/features/tuti/screens/intake/DailyCheckInScreen.tsx", "utf8");
  assert.match(weekly, /return withDefaultIntakeAnswers\(next\)/);
  const flow = readFileSync("src/features/tuti/flows/RecommendationsFlow.tsx", "utf8");
  assert.match(flow, /previousAnswers=\{withDefaultIntakeAnswers\(storedAnswers\)\}/);
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

test("기존 추천이 있어도 주간 질문은 표시하고 답변 재사용·생략만으로 목록을 교체하지 않는다", () => {
  const flow = readFileSync("src/features/tuti/flows/RecommendationsFlow.tsx", "utf8");
  const query = readFileSync("src/features/tuti/hooks/useTutiRecommendations.ts", "utf8");
  assert.ok(flow.includes("isIntakePreferenceCurrent(entryRecord, currentDate)"));
  assert.ok(flow.includes("dailyCheckInRequested ||"));
  assert.ok(flow.includes("dailyCheckInRequested || (!dailyRecordCurrent && !dailyCheckInSnoozed)"));
  assert.ok(!flow.includes("!hasSavedRecommendation && !dailyRecordCurrent"));
  assert.ok(flow.includes('onSkip={() => replaceDailyRecommendation("skipped")}'));
  assert.ok(query.includes("reusableRecommendation(snapshot"));
  assert.ok(query.includes("staleTime: Infinity"));
  assert.ok(query.includes("ownerId ?? null"));
  assert.ok(query.includes("withDefaultIntakeAnswers(storedAnswers)"));
  assert.ok(!query.includes("skippedToday ? {}"));
});

test("주간 재질문의 재사용·생략은 추천·출발 기준·반려견 세부 조건을 보존하고 다음 확인일만 연장한다", () => {
  useTutiStore.persist.setOptions({ storage: createJSONStorage(() => ({ getItem: () => null, setItem() {}, removeItem() {} })) });
  for (const status of ["reused", "skipped"] as const) {
    useTutiStore.getState().resetAllData();
    useTutiStore.getState().setAnswer("petCompanion", "dog");
    useTutiStore.getState().setAnswer("transport", "car");
    useTutiStore.getState().setRecommendationDogOuting("owner", { weightsKg: [8], leash: true, carrier: false, space: "outdoor" });
    useTutiStore.getState().cacheDailyRecommendation("original", "test", [], "unchanged", {
      ownerId: "owner", locationAnchor: { latitude: 37.5, longitude: 127 },
    });
    const before = useTutiStore.getState();
    useTutiStore.getState().completeDailyCheckIn(status);
    const after = useTutiStore.getState();
    assert.equal(after.dailyRecommendation, before.dailyRecommendation);
    assert.equal(after.recommendationCycle, before.recommendationCycle);
    assert.equal(after.recommendationDogOuting, before.recommendationDogOuting);
    assert.deepEqual(after.answers, before.answers);
    assert.equal(after.entryRecord?.status, status);
    const date = after.entryRecord!.effectiveDate!;
    assert.equal(isIntakePreferenceCurrent(after.entryRecord, getKoreanDateKeyAfterDays(6, date)), true);
    assert.equal(isIntakePreferenceCurrent(after.entryRecord, getKoreanDateKeyAfterDays(7, date)), false);
  }
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
