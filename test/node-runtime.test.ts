import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { supportsNodeRuntime } from "../scripts/check-node-runtime.mjs";

test("Node2Shell 수정 전 버전·다른 메이저·시험판을 실행 기준에서 제외한다", () => {
  for (const version of ["24.22.1", "26.12.0", "26.11.9", "27.0.0", "26.13.0-rc.1", "unknown"]) assert.equal(supportsNodeRuntime(version), false, version);
  for (const version of ["v26.12.1", "26.12.2", "26.13.0"]) assert.equal(supportsNodeRuntime(version), true, version);
  const result = spawnSync(process.execPath, ["scripts/check-node-runtime.mjs"], { encoding: "utf8" });
  assert.equal(result.status, supportsNodeRuntime(process.version) ? 0 : 1);
});

test("로컬·CI·앱·운영 이미지가 동일한 Node 26 기준을 공유한다", () => {
  const version = readFileSync(".node-version", "utf8").trim();
  assert.equal(version, "26.12.1");
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(pkg.engines.node, ">=26.12.1 <27");
  assert.match(readFileSync("pnpm-workspace.yaml", "utf8"), /engineStrict: true/);
  for (const file of ["Dockerfile", "Dockerfile.android"]) {
    const docker = readFileSync(file, "utf8");
    const images = [...docker.matchAll(/^FROM node:([^ ]+)/gm)].map(match => match[1]);
    assert.ok(images.length > 0);
    assert.ok(images.every(image => image === `${version}-bookworm-slim`));
  }
  assert.match(readFileSync("Dockerfile.android", "utf8"), /libatomic1/);
  for (const file of readdirSync(".github/workflows").filter(file => file.endsWith(".yml"))) {
    const workflow = readFileSync(`.github/workflows/${file}`, "utf8");
    if (workflow.includes("actions/setup-node@")) {
      assert.doesNotMatch(workflow, /node-version: 24/);
      assert.match(workflow, /node-version-file: \.node-version/);
      assert.match(workflow, /node scripts\/check-node-runtime.mjs/);
    }
  }
  const deploy = readFileSync(".github/workflows/web-production-deploy.yml", "utf8");
  assert.equal((deploy.match(/pull: true/g) ?? []).length, 2);
});
