import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("컬럼 삭제 전 앱을 멈추고 현재 스키마와 호환되는 이미지로만 롤백한다", () => {
  const deploy = readFileSync("scripts/ops/tuti-prod-deploy", "utf8");
  assert.ok(deploy.indexOf("stop app") > deploy.indexOf("sh scripts/ops/tuti-prod-backup"));
  assert.ok(deploy.indexOf("stop app") < deploy.indexOf('echo "운영 DB 마이그레이션"'));
  assert.equal(deploy.match(/if image_matches_schema "\$previous_image"/g)?.length, 2);
  assert.match(deploy, /20261028120000_remove_harumadi_inner_style/);
  const rollback = readFileSync("scripts/ops/tuti-prod-rollback", "utf8");
  assert.ok(rollback.indexOf("com.tuti.harumadi-layout") < rollback.indexOf('echo "앱 이미지를 이전 버전으로'));
  assert.match(readFileSync("Dockerfile", "utf8"), /LABEL com.tuti.harumadi-layout="automatic"/);
  for (const file of ["tuti-prod-deploy", "tuti-prod-rollback", "install-harumadi-deploy-guards"]) {
    assert.equal(spawnSync("sh", ["-n", `scripts/ops/${file}`]).status, 0);
  }
});
