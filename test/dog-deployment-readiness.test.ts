import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("dog catalog must be populated before production app replacement", () => {
  const deploy = readFileSync("scripts/ops/tuti-prod-deploy", "utf8");
  const gate = deploy.indexOf("pnpm db:derived:check --require-data");
  assert.ok(gate > 0);
  assert.ok(gate < deploy.indexOf('echo "새 운영 앱 교체"'));
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(pkg.scripts["db:derived:check"], "tsx scripts/check-dog-recommendation-readiness.ts");
  assert.equal(pkg.scripts["db:derived:sync"], pkg.scripts["db:derived:check"]);
  assert.ok(!pkg.scripts["db:deploy"].includes("legacy"));
});
