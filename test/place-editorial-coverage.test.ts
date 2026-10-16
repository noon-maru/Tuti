import assert from "node:assert/strict";
import test from "node:test";
import { checkEditorialCoverage, willBeRecommendable } from "../src/server/tourism/placeEditorialCoverage";

const place = {
  contentId: "123", name: "테스트 공간", overview: "소개", usageDuration: "약 1시간", hasDetail: true,
};
function inputs() {
  return {
    summaries: new Map<string, string | null>([["123", "요약"]]),
    actions: new Map([["123", "천천히 둘러보세요."]]),
    explicit: new Set(["123"]),
    explicitInputs: new Map([["123", "약 1시간"]]),
  };
}

test("파생 데이터 사전 검사는 모든 누락을 한 번에 보고한다", () => {
  const data = inputs();
  data.summaries.clear(); data.actions.clear(); data.explicit.clear();
  const result = checkEditorialCoverage([place, { ...place, contentId: "456" }], data);
  assert.equal(result.errors.length, 6);
  assert.ok(result.errors.some((error) => error.includes("456")));
});

test("원문과 요약 null 불일치 및 체류시간 변경을 함께 검출한다", () => {
  const data = inputs();
  data.summaries.set("123", null); data.explicitInputs.set("123", "2시간");
  assert.equal(checkEditorialCoverage([place], data).errors.length, 2);
});

test("현재 체류시간 원문이 사라지면 과거 구조화 결과는 경고만 표시한다", () => {
  const result = checkEditorialCoverage([{ ...place, usageDuration: null }], inputs());
  assert.equal(result.errors.length, 0);
  assert.equal(result.warnings.length, 1);
});

test("저장 원문에는 소개가 있지만 가공 필드가 비어 있으면 복원을 요청한다", () => {
  const data = inputs(); data.summaries.set("123", null);
  const result = checkEditorialCoverage([{ ...place, overview: null, normalizedRawOverview: "원문 소개" }], data);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /저장 원문과 소개 필드 불일치.*repair-place-editorial-fields/);
});

test("체류시간 원문의 공백 차이는 변경으로 보지 않는다", () => {
  const data = inputs(); data.explicitInputs.set("123", " 약   1시간 ");
  assert.deepEqual(checkEditorialCoverage([place], data), { errors: [], warnings: [] });
});

test("후보 갱신은 수동 포함과 대기 승인 및 자동 활성화를 반영한다", () => {
  const state = { candidateOverride: "auto", assessmentStatus: "selected", reviewStatus: "pending", visibilityOverride: "auto", isActive: false };
  assert.equal(willBeRecommendable(state), true);
  assert.equal(willBeRecommendable({ ...state, candidateOverride: "exclude" }), false);
  assert.equal(willBeRecommendable({ ...state, reviewStatus: "rejected" }), false);
  assert.equal(willBeRecommendable({ ...state, visibilityOverride: "hide" }), false);
  assert.equal(willBeRecommendable({ ...state, candidateOverride: "include", assessmentStatus: "invalid" }), true);
});
