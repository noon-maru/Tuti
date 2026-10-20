import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("pnpm 스크립트 뒤 구분자는 실제 첫 인자로 전달되어 백업 경로를 가린다", { skip: !process.env.PNPM_TEST_CLI }, async t => {
  const root = await mkdtemp(join(tmpdir(), "tuti-argv-probe-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "package.json"), JSON.stringify({ scripts: { probe: "node probe.cjs" } }));
  await writeFile(join(root, "probe.cjs"), "console.log('ARGV=' + JSON.stringify(process.argv.slice(2)))");
  const result = spawnSync(process.execPath, [process.env.PNPM_TEST_CLI!, "--config.verify-deps-before-run=false", "probe", "--", "/backup"], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.match(result.stdout, /ARGV=\["--","\/backup"\]/);
});

test("객체 백업·복원은 패키지 관리자 없이 경로를 직접 전달하고 누락된 객체 백업은 확정하지 않는다", async () => {
  const backup = await readFile("scripts/ops/tuti-prod-backup", "utf8");
  const restore = await readFile("scripts/ops/tuti-prod-restore", "utf8");
  assert.match(backup, /ops node_modules\/\.bin\/tsx scripts\/backup-object-storage\.ts \/backup/);
  assert.match(restore, /ops node_modules\/\.bin\/tsx scripts\/restore-object-storage\.ts \/backup/);
  assert.doesNotMatch(backup + restore, /ops pnpm ops:objects:/);
  assert.ok(backup.indexOf('if [ ! -s "$temporary_dir/objects.manifest.json" ]') < backup.indexOf('mv "$temporary_dir" "$backup_dir"'));
  for (const script of ["scripts/ops/tuti-prod-backup", "scripts/ops/tuti-prod-restore"]) {
    assert.equal(spawnSync("sh", ["-n", script]).status, 0);
  }
});
