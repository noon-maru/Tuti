import assert from "node:assert/strict";
import test from "node:test";
import { getIntakeSteps } from "@/features/tuti/data/intakeSteps";
import { toActiveIntakeAnswers } from "@/shared/tuti/types";

test("초기 질문은 시간과 차량 이동 여부만 묻는다", () => {
  assert.deepEqual(
    getIntakeSteps({ movement: "short" }).map((step) => step.key),
    ["movement", "transport"],
  );
});

test("오늘 하루에는 출발 시점 질문을 유지한다", () => {
  assert.deepEqual(
    getIntakeSteps({ movement: "far" }).map((step) => step.key),
    ["movement", "transport", "longDistanceTiming"],
  );
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
