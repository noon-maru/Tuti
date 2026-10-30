import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { nextActivityClock } from "../src/shared/analytics/lifecycleClock";
test("한국 자정은 새 활동일이지만 새 세션은 아니며 30분 비활성과 계정 변경은 세션을 분리한다", () => {
  let id = 0;
  const uuid = () => String(++id);
  const first = nextActivityClock(null, "one", Date.parse("2026-10-30T14:59:50Z"), uuid);
  const midnight = nextActivityClock(first.clock, "one", Date.parse("2026-10-30T15:00:01Z"), uuid);
  assert.equal(midnight.newDay, true); assert.equal(midnight.newSession, false);
  const active = nextActivityClock(midnight.clock, "one", midnight.clock.lastAt + 29 * 60_000, uuid);
  assert.equal(active.newSession, false);
  const later = nextActivityClock(active.clock, "one", active.clock.lastAt + 30 * 60_000, uuid);
  assert.equal(later.newSession, true);
  assert.equal(nextActivityClock(later.clock, "two", later.clock.lastAt, uuid).newSession, true);
});
test("화면 관측은 책 GET·polling이 아닌 실제 보임 상태이며 동의 뒤에만 전역 관측기를 붙인다", () => {
  const hook = readFileSync("src/features/tuti/hooks/useLifecycleView.ts", "utf8");
  assert.match(hook, /document.visibilityState/);
  assert.match(hook, /seen.current === key/);
  assert.doesNotMatch(hook, /refetch|setInterval/);
  const shell = readFileSync("src/features/tuti/components/TutiAppShell.tsx", "utf8");
  assert.ok(shell.indexOf("<LifecycleObserver") > shell.indexOf("<Providers>"));
  const queue = readFileSync("src/lib/lifecycle.ts", "utf8");
  assert.match(queue, /fetchWithPinnedSession/);
  assert.match(queue, /item.owner !== getSessionSnapshot/);
  assert.match(queue, /pending.size >= 100/);
  assert.doesNotMatch(queue, /localStorage|JSON.stringify\(.*token/);
});
