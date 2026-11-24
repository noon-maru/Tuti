import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const revision = "a".repeat(40);
const helper = "scripts/ops/check-deployment-image-verification";

function verify(t: test.TestContext, options: Record<string, string> = {}, sha = revision) {
  // NAS /tmp는 실행 제한이 있을 수 있어 저장소 안에서 Docker 대역을 실행한다.
  const root = mkdtempSync(join(process.cwd(), ".deployment-image-verification-"));
  t.after(() => rmSync(root, { recursive: true }));
  writeFileSync(join(root, "docker"), `#!/bin/sh
set -eu
[ "$1" = image ] && [ "$2" = inspect ] && [ "$4" = --format ] || exit 90
[ "\${INSPECT_FAILURE:-false}" != true ] || exit 1
case "$3:$5" in
  app:*org.opencontainers.image.revision*) printf '%s' "$APP_REVISION" ;;
  ops:*org.opencontainers.image.revision*) printf '%s' "$OPS_REVISION" ;;
  ops:*com.tuti.verification*) printf '%s' "$VERIFICATION" ;;
  *) exit 91 ;;
esac
`, { mode: 0o700 });
  return spawnSync("sh", [helper, sha, "app", "ops"], {
    env: { PATH: `${root}:${process.env.PATH}`, APP_REVISION: revision, OPS_REVISION: revision,
      VERIFICATION: "full-suite-v1", ...options },
    encoding: "utf8",
  });
}

test("정확한 커밋의 앱·전체 검증 작업 이미지만 NAS 중복 시험 없이 통과한다", t => {
  const result = verify(t);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    imageVerification: "full-suite-v1", revisionsMatched: true, nasFullSuiteRepeated: false,
  });
});

for (const [name, env] of [
  ["앱 커밋 불일치", { APP_REVISION: "b".repeat(40) }],
  ["작업 커밋 불일치", { OPS_REVISION: "b".repeat(40) }],
  ["검증 표시 없음", { VERIFICATION: "" }],
  ["알 수 없는 검증 규약", { VERIFICATION: "full-suite-v2" }],
  ["메타데이터 조회 실패", { INSPECT_FAILURE: "true" }],
] as Array<[string, Record<string, string>]>) {
  test(`${name}에는 운영 전환을 허용하지 않는다`, t => {
    const result = verify(t, env);
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, "");
  });
}

test("잘못된 커밋은 이미지 검사 전에 거부한다", t => {
  for (const sha of ["", "a".repeat(12), "g".repeat(40)]) assert.notEqual(verify(t, {}, sha).status, 0);
});

test("검증 라벨은 실제 이미지 전체 테스트 뒤에만 생성되고 배포 보호 절차를 유지한다", () => {
  const dockerfile = readFileSync("Dockerfile", "utf8");
  const verified = dockerfile.split("FROM builder AS verified-ops\n")[1]?.split("\nFROM ")[0];
  assert.ok(verified);
  assert.match(verified, /RUN --network=none/);
  assert.match(verified, /pnpm test/);
  assert.ok(verified.indexOf("pnpm test") < verified.indexOf('LABEL com.tuti.verification="full-suite-v1"'));
  assert.match(verified, /LABEL org.opencontainers.image.revision=\$TUTI_BUILD_REVISION/);
  const workflow = readFileSync(".github/workflows/web-production-deploy.yml", "utf8");
  assert.match(workflow, /target: verified-ops/);
  assert.match(workflow, /TUTI_BUILD_REVISION=\$\{\{ github.sha \}\}/);
  assert.match(workflow, /org.opencontainers.image.revision=\$\{\{ github.sha \}\}/);
  assert.match(workflow, /needs: build/);
  const deploy = readFileSync("scripts/ops/tuti-prod-deploy", "utf8");
  assert.match(deploy, /if \[ -n "\$remote_app_image" \]; then\n  echo "Actions/);
  assert.ok(deploy.indexOf("check-deployment-image-verification") < deploy.indexOf("pnpm db:derived:check --require-data"));
  assert.ok(deploy.indexOf("check-deployment-image-verification") < deploy.indexOf("sh scripts/ops/tuti-prod-backup"));
  assert.match(deploy, /image_matches_schema/);
  assert.match(deploy, /새 버전 readiness 확인에 실패/);
  for (const script of [helper, "scripts/ops/tuti-prod-deploy"]) {
    assert.equal(spawnSync("sh", ["-n", script]).status, 0);
  }
});
