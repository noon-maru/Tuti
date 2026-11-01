import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

test("계획 중지는 DSM API만 사용하며 잠금·API 오류·OOM을 우회하지 않는다", async t => {
  if (spawnSync("jq", ["--version"]).status !== 0) { t.skip("호스트 jq가 필요한 셸 통합 검사"); return; }
  const root = await mkdtemp(join(process.cwd(), ".planned-stop-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bin = join(root, "bin");
  await mkdir(bin); await mkdir(join(root, ".ops-state"));
  const definition = join(root, "api.json"), marker = join(root, "stopped"), log = join(root, "calls");
  await writeFile(definition, JSON.stringify({ "SYNO.Docker.Container": { minVersion: 1, maxVersion: 1, methods: { "1": [{ stop: {} }] } } }));
  await writeFile(log, "");
  await writeFile(join(bin, "id"), '#!/bin/sh\necho "${TEST_UID:-0}"\n', { mode: 0o700 });
  await writeFile(join(bin, "synowebapi"), `#!/bin/sh
printf 'api %s\\n' "$*" >> "$TEST_LOG"
case "$*" in *method=get*) echo '{"success":true}'; exit 0 ;; esac
touch "$TEST_MARKER"
case "\${TEST_API:-success}" in
  failure) echo '{"success":false,"error":{"code":105},"private":"do-not-print"}' ;;
  invalid) echo do-not-print ;;
  exit) exit 2 ;;
  *) echo '{"success":true}' ;;
esac
`, { mode: 0o700 });
  await writeFile(join(bin, "docker"), `#!/bin/sh
printf 'docker %s\\n' "$*" >> "$TEST_LOG"
case "$*" in
  *".ExitCode"*) printf 'false|%s|%s\\n' "\${TEST_EXIT:-0}" "\${TEST_OOM:-false}" ;;
  *) if [ -f "$TEST_MARKER" ] || [ "\${TEST_ALREADY:-false}" = true ]; then echo false; else echo true; fi ;;
esac
`, { mode: 0o700 });
  const script = join(root, "stop.sh");
  await writeFile(script, (await readFile("scripts/ops/tuti-planned-container-stop", "utf8"))
    .replaceAll("/var/services/homes/Tutiadmin/source/Tuti", root)
    .replaceAll("/usr/syno/bin/synowebapi", join(bin, "synowebapi"))
    .replaceAll("/var/packages/ContainerManager/target/webapi/SYNO.Docker.lib", definition));
  async function run(args: string[], extra: Record<string, string> = {}, locked = true) {
    await rm(marker, { force: true }); await writeFile(log, "");
    const result = spawnSync("sh", ["-c", `${locked ? 'exec 9>"$TEST_ROOT/.ops-state/maintenance.lock"; /usr/bin/flock --exclusive 9; ' : ''}exec sh "$@"`, "fixture", script, ...args], {
      encoding: "utf8", timeout: 10000,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, TEST_ROOT: root, TEST_MARKER: marker, TEST_LOG: log, ...extra },
    });
    return { ...result, calls: await readFile(log, "utf8") };
  }
  const check = await run(["--check"]);
  assert.equal(check.status, 0, check.stderr); assert.match(check.calls, /method=get/); assert.doesNotMatch(check.calls, /method=stop|docker /);
  for (const name of ["tuti-prod", "tuti-ops-maintenance", "tuti-ops-recovery", "tuti-ops-retention"]) {
    const result = await run([name]); assert.equal(result.status, 0, result.stderr);
    assert.match(result.calls, /api --exec api=SYNO.Docker.Container method=stop version=1 name=tuti-/);
    assert.doesNotMatch(result.calls, /docker (stop|kill|update)/);
  }
  assert.equal((await run(["tuti-prod"], { TEST_EXIT: "143" })).status, 0);
  const already = await run(["tuti-prod"], { TEST_ALREADY: "true" });
  assert.equal(already.status, 0); assert.doesNotMatch(already.calls, /api /);
  const failures: Array<Record<string, string>> = [{ TEST_API: "failure" }, { TEST_API: "invalid" }, { TEST_API: "exit" }, { TEST_EXIT: "137" }, { TEST_OOM: "true" }];
  for (const extra of failures) {
    const result = await run(["tuti-prod"], extra);
    assert.notEqual(result.status, 0); assert.doesNotMatch(result.stdout + result.stderr, /do-not-print/);
    assert.doesNotMatch(result.calls, /docker (stop|kill|update)/);
    if (extra.TEST_API) {
      assert.match(result.stderr, /observed=stopped/);
      assert.match(result.calls, /docker inspect.*ExitCode/);
      if (extra.TEST_API === "invalid") assert.match(result.stderr, /json_valid=false/);
      if (extra.TEST_API === "failure") assert.match(result.stderr, /json_valid=true provider_error=105/);
    }
  }
  for (const args of [["tuti-dev"], ["cloudflared"], ["tuti-prod", "extra"]]) assert.notEqual((await run(args)).status, 0);
  const unlocked = await run(["tuti-prod"], {}, false);
  assert.notEqual(unlocked.status, 0); assert.equal(unlocked.calls, "");
  assert.notEqual((await run(["--check"], { TEST_UID: "1026" })).status, 0);
  await writeFile(definition, '{}');
  const unsupported = await run(["tuti-prod"]);
  assert.notEqual(unsupported.status, 0); assert.equal(unsupported.calls, "");
});

test("백업 일관성·배포 스키마 경계와 장애 알림은 유지한다", async () => {
  for (const file of ["tuti-planned-container-stop", "install-planned-container-stop", "tuti-prod-backup", "tuti-prod-deploy", "tuti-prod-rollback", "tuti-ops-workers"]) {
    assert.equal(spawnSync("sh", ["-n", `scripts/ops/${file}`]).status, 0, file);
  }
  const backup = await readFile("scripts/ops/tuti-prod-backup", "utf8");
  assert.ok(backup.indexOf('tuti-planned-container-stop" tuti-prod') < backup.indexOf("backup_worker backup-cleanup"));
  assert.ok(backup.indexOf('tuti-planned-container-stop" tuti-prod') < backup.indexOf("pg_dump"));
  assert.match(backup, /timeout 30 docker start "\$app_container_id"/);
  assert.doesNotMatch(backup, /up -d --no-deps app|Config.Env/);
  const helper = await readFile("scripts/ops/tuti-planned-container-stop", "utf8");
  assert.doesNotMatch(helper, /docker (?:stop|kill|update)|synonotify|config\.v2|\.config[ '\"]/);
  assert.match(helper, /timeout 45/);
  const installer = await readFile("scripts/ops/install-planned-container-stop", "utf8");
  assert.ok(installer.indexOf('tuti-planned-container-stop --check') < installer.indexOf('for tool in $tools; do install'));
  assert.doesNotMatch(installer, /systemctl (?:stop|disable)|docker (?:stop|kill)/);
});

test("백업 복구 설치는 두 도구만 백업·교체하며 앱·백업·예약은 실행하지 않는다", async t => {
  const root = await mkdtemp(join(process.cwd(), ".backup-recovery-install-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const folder of ["bin", "installed", "scripts/ops", ".ops-state"]) await mkdir(join(root, folder), { recursive: true });
  await writeFile(join(root, "bin/id"), '#!/bin/sh\necho 0\n', { mode: 0o700 });
  await writeFile(join(root, "bin/git"), '#!/bin/sh\nexit 0\n', { mode: 0o700 });
  await writeFile(join(root, "scripts/ops/tuti-prod-backup"), '#!/bin/sh\necho do-not-execute\n');
  await writeFile(join(root, "scripts/ops/tuti-planned-container-stop"), '#!/bin/sh\n[ "$1" = --check ] || exit 1\necho read-only-check\n');
  await writeFile(join(root, "installed/tuti-prod-backup"), "old-backup");
  await writeFile(join(root, "installed/tuti-prod-deploy"), "untouched-deploy");
  const source = (await readFile("scripts/ops/install-backup-recovery", "utf8"))
    .replaceAll("/var/services/homes/Tutiadmin/source/Tuti", root)
    .replaceAll("/usr/local/sbin", join(root, "installed"))
    .replaceAll("install -d -o root -g root", "install -d")
    .replaceAll("install -o root -g root", "install");
  const script = join(root, "installer.sh"); await writeFile(script, source);
  const env = { ...process.env, PATH: `${join(root, "bin")}:${process.env.PATH}` };
  const dry = spawnSync("sh", [script], { env, encoding: "utf8" });
  assert.equal(dry.status, 0, dry.stderr);
  assert.equal(await readFile(join(root, "installed/tuti-prod-backup"), "utf8"), "old-backup");
  const apply = spawnSync("sh", [script, "--apply"], { env, encoding: "utf8" });
  assert.equal(apply.status, 0, apply.stderr);
  assert.match(apply.stdout, /read-only-check/);
  assert.doesNotMatch(apply.stdout, /do-not-execute/);
  assert.match(await readFile(join(root, "installed/tuti-prod-backup"), "utf8"), /do-not-execute/);
  assert.equal(await readFile(join(root, "installed/tuti-prod-deploy"), "utf8"), "untouched-deploy");
  const snapshot = apply.stdout.match(/이전 설치본: (.+)/)![1];
  assert.equal(await readFile(join(snapshot, "tuti-prod-backup"), "utf8"), "old-backup");
});
