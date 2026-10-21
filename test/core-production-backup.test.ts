import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

test("운영 핵심 백업도 실제 검증한 동일 제외 정책만 사용하고 원장은 두 경로 정리 후 파기한다", async () => {
  const policy = (await readFile("scripts/ops/core-backup-excluded-data-tables.txt", "utf8")).trim().split("\n");
  const guard = await readFile("scripts/ops/core-backup-production-guard.sql", "utf8");
  const array = guard.split("ARRAY[")[1].split("];")[0];
  assert.deepEqual([...array.matchAll(/'([a-z_]+)'/g)].map(match => match[1]), policy);
  assert.match(guard, /BEGIN READ ONLY/);
  assert.match(guard, /CORE_DEPENDENCY_BLOCKED/);
  assert.match(guard, /CORE_POLICY_TABLE_MISSING/);
  const prune = await readFile("scripts/prune-production-backups.ts", "utf8");
  assert.ok(prune.indexOf('planBackupRetention("/core-backup-retention"') < prune.indexOf('applyBackupRetention("/backup-retention"'));
  assert.ok(prune.indexOf('applyBackupRetention("/core-backup-retention"') < prune.indexOf('await prunePrivacyReplayLedger'));
  assert.match(prune, /skipped = plan.skipped \+ corePlan.skipped/);
  const installer = await readFile("scripts/ops/install-core-backup", "utf8");
  assert.ok(installer.indexOf('sh scripts/ops/tuti-prod-backup-verify --core') < installer.indexOf('systemctl enable tuti-core-backup.timer'));
  assert.doesNotMatch(installer, /systemctl[^\n]*--now|systemctl (?:stop|disable) tuti-backup-retention/);
  for (const file of ["tuti-prod-backup", "tuti-prod-backup-prune", "tuti-prod-restore", "tuti-prod-backup-verify", "tuti-prod-backup-restore-test", "install-core-backup"]) {
    assert.equal(spawnSync("sh", ["-n", `scripts/ops/${file}`]).status, 0, file);
  }
});

test("예약 실행은 SUDO_UID 없이도 실제 저장소 경로만 Git 신뢰 대상으로 사용한다", async () => {
  const root = process.cwd();
  const env = { PATH: "/usr/bin:/bin", GIT_TEST_ASSUME_DIFFERENT_OWNER: "true" };
  const rejected = spawnSync("git", ["-c", "safe.directory=/a/different/path", "ls-files", "--error-unmatch", "scripts/ops/core-backup-production-guard.sql"], { cwd: root, env, encoding: "utf8" });
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /dubious ownership/);
  const accepted = spawnSync("sh", ["-c", 'canonical="$(pwd -P)"; git -c safe.directory="$canonical" ls-files --error-unmatch scripts/ops/core-backup-production-guard.sql'], { cwd: root, env, encoding: "utf8" });
  assert.equal(accepted.status, 0, accepted.stderr);
  for (const name of ["tuti-prod-backup", "tuti-prod-backup-prune", "tuti-prod-backup-verify", "tuti-prod-backup-restore-test", "install-core-backup"]) {
    const source = await readFile(`scripts/ops/${name}`, "utf8");
    assert.ok(source.indexOf('pwd -P') < source.indexOf('git -c safe.directory='), name);
    assert.doesNotMatch(source, /safe.directory=\*/);
  }
});

test("가짜 Docker로 전체·핵심 백업 경로·덤프 옵션·객체 동시점·실패 후 재시작을 검증한다", async t => {
  const base = await mkdtemp(join(process.cwd(), ".core-production-test-"));
  t.after(() => rm(base, { recursive: true, force: true }));
  const bin = join(base, "bin"); await mkdir(bin);
  const executable = async (name: string, text: string) => writeFile(join(bin, name), `#!/bin/sh\nset -eu\n${text}\n`, { mode: 0o700 });
  await executable("git", 'printf "synthetic-revision\\n"');
  await executable("install", 'while [ "$#" -gt 1 ]; do shift; done; mkdir -p "$1"');
  await executable("docker", `
printf '%s\\n' "$*" >> "$MOCK_LOG"
case "$*" in
  "inspect tuti-prod --format {{.State.Running}}") echo true ;;
  "inspect tuti-prod --format {{.Config.Image}}") echo tuti:prod-fixture ;;
  inspect*) echo TUTI_RELEASE=fixture ;;
  *"exec -T db"*psql*) if [ "$MOCK_FAIL" = guard ]; then exit 1; fi; cat >/dev/null ;;
  *"exec -T db"*pg_dump*) if [ "$MOCK_FAIL" = dump ]; then exit 1; fi; printf PGDMPsynthetic ;;
  *scripts/backup-object-storage.ts*)
    if [ "$MOCK_FAIL" = objects ]; then exit 1; fi
    target=""
    while [ "$#" -gt 0 ]; do
      if [ "$1" = -v ]; then shift; target="$(printf '%s' "$1" | sed 's|:/backup$||')"; break; fi
      shift
    done
    mkdir -p "$target/objects"
    printf '{"version":1,"objects":[],"count":0,"totalBytes":0}' > "$target/objects.manifest.json"
    ;;
esac`);
  const original = await readFile("scripts/ops/tuti-prod-backup", "utf8");
  for (const [index, scope, failure] of [[0, "full", ""], [1, "core", ""], [2, "core", "guard"], [3, "core", "dump"], [4, "core", "objects"]] as const) {
    const root = join(base, String(index)); await mkdir(root);
    await mkdir(join(root, "scripts/ops"), { recursive: true });
    for (const file of ["core-backup-excluded-data-tables.txt", "core-backup-production-guard.sql"]) await writeFile(join(root, "scripts/ops", file), await readFile(`scripts/ops/${file}`));
    const script = join(root, "backup.sh");
    await writeFile(script, original.replaceAll("/var/services/homes/Tutiadmin/source/Tuti", root).replaceAll("/volume1/tuti/backups/full", join(root, "full")).replaceAll("/volume1/tuti/backups/core", join(root, "core")));
    const log = join(root, "log");
    const run = spawnSync("sh", [script, ...(scope === "core" ? ["--core"] : [])], { encoding: "utf8", env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, MOCK_LOG: log, MOCK_FAIL: failure } });
    const calls = await readFile(log, "utf8");
    assert.match(calls, /stop app/);
    assert.match(calls, /up -d --no-deps app/);
    assert.ok(calls.indexOf("stop app") < calls.indexOf("privacy-replay.ts --cleanup-objects --apply"));
    const entries = await readdir(join(root, scope));
    if (failure) {
      assert.notEqual(run.status, 0, run.stdout + run.stderr);
      assert.deepEqual(entries, []);
      if (failure === "guard") assert.doesNotMatch(calls, /pg_dump/);
    } else {
      assert.equal(run.status, 0, run.stdout + run.stderr);
      assert.equal(entries.length, 1);
      const backup = join(root, scope, entries[0]);
      assert.match(await readFile(join(backup, "manifest.txt"), "utf8"), new RegExp(`database=production-${scope}-custom-dump`));
      const checksums = await readFile(join(backup, "checksums.sha256"), "utf8");
      assert.match(checksums, /objects.manifest.json/);
      if (scope === "core") {
        assert.match(checksums, /excluded-data-tables.txt/);
        assert.equal((calls.match(/--exclude-table-data=public\./g) ?? []).length, 12);
      } else assert.doesNotMatch(calls, /--exclude-table-data/);
    }
  }
});
