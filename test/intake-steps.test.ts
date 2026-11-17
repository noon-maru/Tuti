import assert from "node:assert/strict";
import test from "node:test";
import { getIntakeSteps } from "@/features/tuti/data/intakeSteps";
import { toActiveIntakeAnswers } from "@/shared/tuti/types";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { IntakeScreen } from "@/features/tuti/screens/intake/IntakeScreen";

test("초기 질문은 반려견 동반·시간·차량 순서로 묻는다", () => {
  assert.deepEqual(
    getIntakeSteps({ movement: "short" }).map((step) => step.key),
    ["petCompanion", "movement", "transport"],
  );
});

test("오늘 하루에는 출발 시점 질문을 유지한다", () => {
  assert.deepEqual(
    getIntakeSteps({ movement: "far" }).map((step) => step.key),
    ["petCompanion", "movement", "transport", "longDistanceTiming"],
  );
});

test("동반할 때만 장소 카테고리를 복수 선택하고 동반 해제 시 지난 선택을 전달하지 않는다", () => {
  assert.deepEqual(getIntakeSteps({ petCompanion: "dog", movement: "near" }).map(step => step.key), ["petCompanion", "movement", "transport", "placeCategories"]);
  assert.equal(getIntakeSteps({ petCompanion: "none" }).some(step => step.key === "placeCategories"), false);
  assert.equal(toActiveIntakeAnswers({ petCompanion: "none", placeCategories: ["shopping"] }).placeCategories, undefined);
  assert.deepEqual(toActiveIntakeAnswers({ petCompanion: "dog", placeCategories: ["shopping", "cafe"] }).placeCategories, ["shopping", "cafe"]);
});

test("이전 버전의 공기와 밀도 답변은 신규 추천 입력에서 제거한다", () => {
  assert.deepEqual(
    toActiveIntakeAnswers({
      movement: "short",
      transport: "car",
      air: "quiet",
      density: "lively",
      companion: "solo",
    }),
    {
      movement: "short",
      transport: "car",
      companion: "solo",
      budget: undefined,
    },
  );
});

test("반려견 동반일 때만 한 시간 안에를 숨기고 한두 시간부터 선택한다", () => {
  const movement = (petCompanion?: string) => getIntakeSteps({ petCompanion }).find(step => step.key === "movement")!;
  assert.deepEqual(movement("dog").options.map(option => option.value), ["short", "half", "far"]);
  for (const petCompanion of ["none", undefined]) {
    assert.deepEqual(movement(petCompanion).options.map(option => option.value), ["near", "short", "half", "far"]);
  }
  assert.equal(movement("dog").options[0].label, "한두 시간");
});

test("실제 시간 슬라이더의 3·4개 선택지와 마지막 손잡이 위치는 같은 전체 폭을 사용한다", () => {
  const noop = () => {};
  for (const petCompanion of ["dog", "none"]) {
    const activeStep = getIntakeSteps({ petCompanion, movement: "far" }).find(step => step.key === "movement")!;
    const html = renderToStaticMarkup(createElement(IntakeScreen, {
      step: 1, total: 4, activeStep, selectedValue: "far", auxiliaryConditions: {},
      onBack: noop, onChoose: noop, onNext: noop, onRestoreRecords: noop, onSkip: noop, onCompanionChange: noop, onBudgetChange: noop,
    }));
    assert.equal(html.includes("한 시간 안에"), petCompanion !== "dog");
    assert.match(html, /left:calc\(12px \+ \(100% - 24px\) \* 1\)/);
    assert.ok(html.includes(`grid-template-columns:repeat(${petCompanion === "dog" ? 3 : 4}, minmax(0, 1fr))`));
    assert.match(html, petCompanion === "dog" ? /max="2"/ : /max="3"/);
    assert.match(html, /aria-valuetext="오늘 하루,/);
  }
});
