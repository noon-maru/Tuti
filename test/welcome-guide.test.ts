import assert from "node:assert/strict";
import test from "node:test";
import { parseWelcomeGuideStep, welcomeGuidePath, WELCOME_GUIDE } from "../src/shared/tuti/welcomeGuide";

test("이용 방법은 첫 화면·장소 질문과 분리된 세 화면으로 구성한다", () => {
  assert.equal(WELCOME_GUIDE.length, 3);
  assert.equal(parseWelcomeGuideStep(null, null), null);
  assert.equal(parseWelcomeGuideStep("questions", "1"), null);
  for (const step of [0, 1, 2] as const) {
    assert.equal(parseWelcomeGuideStep("guide", String(step)), step);
    assert.equal(welcomeGuidePath(step), `/entry?mode=guide&step=${step}`);
  }
});

test("잘못된 안내 단계와 직접 접속은 안전하게 첫 안내로 연결한다", () => {
  for (const step of [null, "-1", "3", "1.5", "unknown"]) assert.equal(parseWelcomeGuideStep("guide", step), 0);
});
