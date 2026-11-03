import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";
test("예약 발송은 유지보수·복원 잠금과 설치 전 조회 경계를 유지한다", () => {
  for (const file of ["scripts/ops/tuti-notifications-dispatch", "scripts/ops/install-notifications", "scripts/ops/tuti-ops-workers"]) {
    assert.equal(spawnSync("sh", ["-n", file]).status, 0);
  }
  const dispatch = readFileSync("scripts/ops/tuti-notifications-dispatch", "utf8");
  assert.match(dispatch, /maintenance\.lock/); assert.match(dispatch, /restore-privacy\/pending/); assert.match(dispatch, /privacy-activation\/pending/);
  assert.match(dispatch, /tuti-ops-workers notifications/); assert.doesNotMatch(dispatch, /docker (?:run|build)/);
  const install = readFileSync("scripts/ops/install-notifications", "utf8");
  assert.match(install, /systemctl enable tuti-notifications.timer/); assert.doesNotMatch(install, /--now/);
  assert.match(readFileSync("scripts/ops/systemd/tuti-notifications.timer", "utf8"), /Persistent=false/);
});
