import assert from "node:assert/strict";
import test from "node:test";
import { ExpiringCache } from "@/server/cache/expiringCache";

test("경로 캐시는 후속 조회가 없어도 만료 시 항목을 제거한다", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000 });
  const cache = new ExpiringCache<string, string>(2);
  cache.set("route", "result", 300_000);
  assert.equal(cache.get("route"), "result");
  t.mock.timers.tick(299_999);
  assert.equal(cache.size, 1);
  t.mock.timers.tick(1);
  assert.equal(cache.size, 0);
});

test("교체된 항목의 이전 타이머·지연 실패가 새 값을 지우지 않는다", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000 });
  const cache = new ExpiringCache<string, object>(2);
  const oldValue = {};
  const newValue = {};
  cache.set("route", oldValue, 100);
  t.mock.timers.tick(50);
  cache.set("route", newValue, 100);
  cache.deleteIfValue("route", oldValue);
  t.mock.timers.tick(50);
  assert.equal(cache.get("route"), newValue);
  t.mock.timers.tick(50);
  assert.equal(cache.size, 0);
});

test("용량 제한과 명시적 삭제는 타이머와 항목을 함께 정리한다", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000 });
  const cache = new ExpiringCache<string, number>(1);
  cache.set("old", 1, 100);
  cache.set("new", 2, 200);
  assert.equal(cache.get("old"), undefined);
  assert.equal(cache.size, 1);
  cache.delete("new");
  assert.equal(cache.size, 0);
  t.mock.timers.tick(300);
  assert.equal(cache.size, 0);
  assert.throws(() => cache.set("invalid", 3, 0));
  assert.throws(() => cache.set("overflow", 3, 2_147_483_648));
  assert.throws(() => new ExpiringCache(0));
});
