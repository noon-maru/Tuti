import assert from "node:assert/strict";
import test from "node:test";
import { createActiveTimeTracker } from "../src/shared/analytics/activeTime";
import { parseLifecycleInput } from "../src/shared/api/lifecycle";

test("활성 시간은 전경·상호작용 60초 이내만 누적하고 숨김·긴 지연·계정 변경을 제외한다", () => {
  const slices: Array<{ owner: string; ms: number; end: number }> = [];
  const tracker = createActiveTimeTracker((owner, ms, end) => slices.push({ owner, ms, end }));
  tracker.sample(0, "a", true, true);
  tracker.sample(5_000, "a", true, true);
  assert.equal(slices.length, 0);
  tracker.sample(15_000, "a", true);
  assert.deepEqual(slices.pop(), { owner: "a", ms: 15_000, end: 15_000 });
  tracker.sample(20_000, "a", false, false, true);
  assert.equal(slices.pop()?.ms, 5_000);
  tracker.sample(35_000, "a", false);
  assert.equal(slices.length, 0);
  tracker.sample(40_000, "a", true, true);
  for (const at of [55_000, 70_000, 85_000, 100_000, 115_000, 130_000]) tracker.sample(at, "a", true);
  assert.equal(slices.reduce((sum, s) => sum + s.ms, 0), 60_000);
  tracker.sample(200_000, "a", true);
  tracker.sample(215_000, "a", true);
  assert.equal(slices.reduce((sum, s) => sum + s.ms, 0), 60_000, "타이머 지연이 상호작용을 만들어내지 않는다");
  slices.length = 0;
  tracker.sample(220_000, "a", true, true);
  tracker.sample(225_000, "a", true);
  tracker.sample(230_000, "b", true, true);
  tracker.sample(235_000, "b", false, false, true);
  assert.deepEqual(slices, [{ owner: "b", ms: 5_000, end: 235_000 }]);
  tracker.reset(); tracker.sample(250_000, undefined, true);
  assert.equal(slices.length, 1);
});

test("활성 구간 입력은 세션·시각·1~30000ms를 요구하고 다른 사건의 시간 위조를 거절한다", () => {
  const id = "bb17e0d4-d207-4d0e-9bf0-d00604d60e8a";
  const valid = { id, name: "session_active", sessionId: id, observedAt: "2026-11-02T00:00:00Z", activeMilliseconds: 15_000 };
  assert.equal(parseLifecycleInput(valid)?.activeMilliseconds, 15_000);
  for (const ms of [0, -1, 30001, 1.5, "15000", null]) assert.equal(parseLifecycleInput({ ...valid, activeMilliseconds: ms }), null);
  for (const patch of [{ sessionId: undefined }, { observedAt: undefined }, { entityId: "book" }, { name: "home_viewed" }]) assert.equal(parseLifecycleInput({ ...valid, ...patch }), null);
});
