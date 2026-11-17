import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { ExplorePreferences } from "@/features/tuti/components/ExplorePreferences";

const handlers = { onCompanionChange() {}, onBudgetChange() {}, onDogOutingChange() {} };
test("선택 조건은 하나의 접기 영역으로 묶고 별도 적용·중첩 스크롤을 만들지 않는다", () => {
  const html = renderToStaticMarkup(createElement(ExplorePreferences, { ...handlers, withDog: true, companion: "partner", budget: "free", dogOuting: { weightsKg: [8], leash: true, carrier: null, space: "indoor" } }));
  assert.equal((html.match(/<details\b/g) ?? []).length, 1);
  assert.match(html, /8kg · 실내 · 준비물 1개 설정 · 연인과 · 입장료 무료/);
  for (const label of ["이용할 공간", "함께 가는 반려견", "사용할 준비물", "함께 갈 사람", "입장료"]) assert.match(html, new RegExp(label));
  assert.doesNotMatch(html, /<select|세부 조건 적용|세부 조건을 선택했어요|프로필 등록은 필요/);
  const source = readFileSync("src/features/tuti/components/DogOutingControls.tsx", "utf8");
  assert.doesNotMatch(source, /overflow-y|max-height/);
  assert.match(source, /min-height: 44px/);
});
test("비동반 질문에는 반려견 필드를 표시하지 않고 오류는 접은 상태의 요약에도 남긴다", () => {
  const noDog = renderToStaticMarkup(createElement(ExplorePreferences, { ...handlers, withDog: false }));
  assert.doesNotMatch(noDog, /이용할 공간|사용할 준비물|몸무게/);
  assert.match(noDog, /함께 갈 사람/);
  const invalid = renderToStaticMarkup(createElement(ExplorePreferences, { ...handlers, withDog: true, dogConditionsValid: false }));
  const summary = invalid.slice(invalid.indexOf("<summary"), invalid.indexOf("</summary>"));
  assert.match(summary, /몸무게 입력을 확인해주세요/);
});
