import assert from "node:assert/strict";
import test from "node:test";
import { getIntakeSteps } from "@/features/tuti/data/intakeSteps";
import { toActiveIntakeAnswers } from "@/shared/tuti/types";

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
