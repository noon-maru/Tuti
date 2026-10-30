import assert from "node:assert/strict";
import test from "node:test";
import { analyticsPeriod, analyticsUserWhere, koreanDay, metricRate, normalizeAnalyticsDays } from "../src/server/admin/analyticsScope";

test("제품 분석은 관리자·QA를 공통 제외하고 분모가 없으면 0%로 만들지 않는다", () => {
  assert.deepEqual(analyticsUserWhere, { role: "user", analyticsExcludedAt: null });
  assert.equal(metricRate(0, 0), null);
  assert.equal(metricRate(1, 4), 25);
  assert.equal(normalizeAnalyticsDays("7"), 7);
  assert.equal(normalizeAnalyticsDays("120"), 30);
});
test("한국 자정과 월말에서 선택 기간·이전 기간은 겹치지 않고 미래를 포함하지 않는다", () => {
  const now = new Date("2026-10-31T15:00:00.000Z");
  const range = analyticsPeriod(7, now);
  assert.equal(range.start.toISOString(), "2026-10-25T15:00:00.000Z");
  assert.equal(range.end.getTime(), now.getTime() + 1);
  assert.equal(range.previousEnd.getTime(), range.start.getTime());
  assert.equal(range.previousStart.toISOString(), "2026-10-18T15:00:00.000Z");
  assert.equal(koreanDay(now) - koreanDay(new Date(now.getTime() - 1)), 1);
});
