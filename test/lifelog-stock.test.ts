import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
test("현재 보유량은 DB 스냅샷으로 원본·책·참여자를 중복 없이 집계하고 개인 원문을 반환하지 않는다", () => {
  const source = readFileSync("src/server/admin/lifelogStock.ts", "utf8");
  assert.match(source, /analytics_excluded_at IS NULL/);
  assert.match(source, /count\(DISTINCT l.owner_id\)/);
  assert.match(source, /authors>=2/);
  assert.match(source, /m.ended_at IS NULL/);
  assert.match(source, /percentile_cont\(0.9\)/);
  assert.doesNotMatch(source, /take: 500|SELECT \*|j\.content|j\.title|u\.email/);
  const route = readFileSync("src/app/api/admin/lifelog-metrics/route.ts", "utf8");
  assert.match(route, /authenticateAdmin\(request\)/);
  assert.match(route, /current-surviving-data/);
  assert.match(route, /private, no-store/);
});
