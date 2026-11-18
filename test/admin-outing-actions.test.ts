import assert from "node:assert/strict";
import test from "node:test";
import { summarizeOutingActions } from "../src/shared/analytics/recommendationActions";
test("기간 내 행동은 오래된 캐시 여정도 포함하며 재전송을 중복 집계하지 않는다", () => {
  const actions = [{ journeyId: "last-month", action: "journal_created" }, { journeyId: "last-month", action: "journal_created" }, { journeyId: "today", action: "navigation_started" }];
  const result = summarizeOutingActions(actions);
  assert.equal(result.find(r => r.action === "journal_created")?.journeys, 1);
  assert.equal(result.find(r => r.action === "return_confirmed")?.journeys, 0, "저장 관측이 방문을 암시하지 않는다");
  assert.equal(result.find(r => r.action === "navigation_started")?.journeys, 1);
});
