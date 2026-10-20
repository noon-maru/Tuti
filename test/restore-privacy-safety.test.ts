import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const backupId = "20261019-120000";

function fixture(t: test.TestContext) {
  // 일부 NAS의 /tmp는 noexec다. 실행 대역은 저장소 안의 고유 임시 폴더에 둔다.
  const root = mkdtempSync(join(process.cwd(), ".restore-privacy-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, "package.json"), '{"type":"commonjs"}');
  const project = join(root, "project");
  const backups = join(root, "backups");
  const bin = join(root, "bin");
  const log = join(root, "docker.jsonl");
  const image = join(root, "image.txt");
  const backup = join(backups, backupId);
  const pending = join(project, ".ops-state/restore-privacy/pending.env");
  mkdirSync(join(project, ".ops-state/deploy"), { recursive: true });
  mkdirSync(backup, { recursive: true });
  mkdirSync(bin);
  writeFileSync(join(project, ".ops-state/deploy/releases.env"), "current_image=tuti:prod-current\ncurrent_release=current\nprevious_image=tuti:prod-previous\nprevious_release=previous\n");
  const files = { "postgres.dump": "test dump", "objects.manifest.json": "{}", "manifest.txt": "created_at=2026-10-19T12:00:00+09:00\n" };
  for (const [name, contents] of Object.entries(files)) writeFileSync(join(backup, name), contents);
  writeFileSync(join(backup, "checksums.sha256"), Object.entries(files).map(([name, contents]) => `${createHash("sha256").update(contents).digest("hex")}  ${name}`).join("\n") + "\n");
  const scripts = new Map<string, string>();
  for (const name of ["tuti-prod-restore", "tuti-prod-rollback", "tuti-prod-deploy"]) {
    const source = readFileSync(new URL(`../scripts/ops/${name}`, import.meta.url), "utf8")
      .replace('project_dir="/var/services/homes/Tutiadmin/source/Tuti"', `project_dir=${JSON.stringify(project)}`)
      .replace('PATH="/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin:$PATH"', 'PATH="$PATH"')
      .replace("/volume1/tuti/backups/full | /volumeUSB*/*", `${backups} | /volumeUSB*/*`);
    const target = join(root, name);
    writeFileSync(target, source);
    scripts.set(name, target);
  }
  // 실제 Docker·root 파일·운영 DB에는 접근하지 않는 테스트 대역이다.
  writeFileSync(join(bin, "docker.cjs"), `
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.TEST_DOCKER_LOG, JSON.stringify({args, image: process.env.TUTI_APP_IMAGE}) + String.fromCharCode(10));
if (args[0] === 'inspect') {
  console.log(args.join(' ').includes('Config.Env') ? 'TUTI_RELEASE=previous' : (fs.existsSync(process.env.TEST_IMAGE_FILE) ? fs.readFileSync(process.env.TEST_IMAGE_FILE, 'utf8') : 'tuti:prod-current'));
}
if (args.includes('create') && args.includes('--no-deps')) process.exit(1);
if (args.includes('up') && args.includes('--no-start') && process.env.TUTI_APP_IMAGE) fs.writeFileSync(process.env.TEST_IMAGE_FILE, process.env.TUTI_APP_IMAGE);
if (args.includes('scripts/privacy-replay.ts') && args.includes('--mode')) console.log(process.env.TEST_LEDGER_MODE || 'disabled');
if (args.includes('scripts/privacy-replay.ts') && args.includes('--apply') && process.env.TEST_LEDGER_REPLAY_FAIL === 'true') process.exit(1);
if (args.join(' ').includes('pg_restore') && process.env.TEST_RESTORE_FAIL === 'true') process.exit(1);
if (args.includes('exec') && args.includes('app') && process.env.TEST_HEALTH_FAIL === 'true') process.exit(1);
`);
  writeFileSync(join(bin, "install.cjs"), `
const fs = require('node:fs');
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (['-o','-g','-m'].includes(args[i])) { i++; continue; }
  if (args[i] === '-d') continue;
  fs.mkdirSync(args[i], {recursive: true});
}
`);
  for (const command of ["docker", "install"]) {
    writeFileSync(join(bin, command), `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} -- ${JSON.stringify(join(bin, `${command}.cjs`))} "$@"\n`);
  }
  chmodSync(join(bin, "docker"), 0o700);
  chmodSync(join(bin, "install"), 0o700);
  writeFileSync(join(bin, "sleep"), "#!/bin/sh\nexit 0\n");
  writeFileSync(join(bin, "git"), "#!/bin/sh\ncase \"$*\" in *rev-parse*) printf 'abcdef123456\\n' ;; esac\n");
  chmodSync(join(bin, "sleep"), 0o700);
  chmodSync(join(bin, "git"), 0o700);
  const run = (name: string, args: string[] = [], extra: Record<string, string> = {}) => spawnSync("sh", [scripts.get(name)!, ...args], {
    encoding: "utf8",
    env: { ...process.env, NODE_TEST_CONTEXT: undefined, PATH: `${bin}:${process.env.PATH}`, TUTI_FULL_BACKUP_ROOT: backups, TEST_DOCKER_LOG: log, TEST_IMAGE_FILE: image, ...extra },
    timeout: 10000,
  });
  const calls = () => existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as { args: string[]; image?: string }) : [];
  return { pending, run, calls, stateFile: join(project, ".ops-state/deploy/releases.env") };
}

test("DB 복원 뒤에는 앱을 자동 재시작하지 않고, 코드 롤백 준비 후 별도로 재개한다", (t) => {
  const system = fixture(t);
  const restored = system.run("tuti-prod-restore", [backupId, "--confirm-production-restore"]);
  assert.equal(restored.status, 0, restored.stderr);
  assert.match(readFileSync(system.pending, "utf8"), /status=restored_pending_review/);
  assert.equal(system.calls().some((call) => call.args.includes("up")), false);
  const staged = system.run("tuti-prod-rollback");
  assert.equal(staged.status, 0, staged.stderr);
  assert.ok(system.calls().some((call) => call.args.includes("up") && call.args.includes("--no-start") && call.image === "tuti:prod-previous"));
  assert.equal(system.calls().some((call) => call.args.includes("up") && !call.args.includes("--no-start")), false);
  const resumed = system.run("tuti-prod-restore", ["--resume-reviewed", backupId, "REVIEW-123"]);
  assert.equal(resumed.status, 0, resumed.stderr);
  assert.equal(existsSync(system.pending), false);
  assert.ok(system.calls().some((call) => call.args.includes("--restart=unless-stopped")));
  assert.ok(system.calls().some((call) => call.args.includes("up") && call.image === "tuti:prod-previous"));
  assert.match(readFileSync(system.stateFile, "utf8"), /current_image=tuti:prod-previous/);
  assert.match(readFileSync(system.stateFile, "utf8"), /previous_image=tuti:prod-current/);
});

test("DB 복원 실패 시 앱을 멈춘 채 유지하며, 완료되지 않은 복원을 재개 승인할 수 없다", (t) => {
  const system = fixture(t);
  const failed = system.run("tuti-prod-restore", [backupId, "--confirm-production-restore"], { TEST_RESTORE_FAIL: "true" });
  assert.notEqual(failed.status, 0);
  assert.match(readFileSync(system.pending, "utf8"), /status=restoring/);
  assert.equal(system.calls().some((call) => call.args.includes("up")), false);
  assert.notEqual(system.run("tuti-prod-restore", ["--resume-reviewed", backupId, "REVIEW-123"]).status, 0);
  assert.equal(system.calls().some((call) => call.args.includes("up")), false);
});

test("DB 복원이 없는 일반 앱 롤백은 기존처럼 즉시 시작한다", (t) => {
  const system = fixture(t);
  const rolledBack = system.run("tuti-prod-rollback");
  assert.equal(rolledBack.status, 0, rolledBack.stderr);
  assert.ok(system.calls().some((call) => call.args.includes("up") && call.image === "tuti:prod-previous"));
});

test("복원 원장이 활성화되면 재개 전에 재반영하고 실패 시 서비스는 중지 상태를 유지한다", (t) => {
  const system = fixture(t);
  const restored = system.run("tuti-prod-restore", [backupId, "--confirm-production-restore"], { TEST_LEDGER_MODE: "enabled" });
  assert.equal(restored.status, 0, restored.stderr);
  assert.match(readFileSync(system.pending, "utf8"), /privacy_ledger_required=true/);
  const failed = system.run("tuti-prod-restore", ["--resume-reviewed", backupId, "REVIEW-456"], { TEST_LEDGER_MODE: "enabled", TEST_LEDGER_REPLAY_FAIL: "true" });
  assert.notEqual(failed.status, 0);
  assert.equal(system.calls().some((call) => call.args.includes("up")), false);
  assert.equal(existsSync(system.pending), true);
  const resumed = system.run("tuti-prod-restore", ["--resume-reviewed", backupId, "REVIEW-456"], { TEST_LEDGER_MODE: "enabled" });
  assert.equal(resumed.status, 0, resumed.stderr);
  const calls = system.calls();
  const replay = calls.findIndex((call) => call.args.includes("--apply"));
  const startup = calls.findIndex((call) => call.args.includes("up"));
  assert.ok(replay >= 0 && startup > replay);
});

test("복원 확인 중 배포는 새 이미지만 준비하고 DB 마이그레이션·서비스 시작을 보류한다", (t) => {
  const system = fixture(t);
  assert.equal(system.run("tuti-prod-restore", [backupId, "--confirm-production-restore"]).status, 0);
  const staged = system.run("tuti-prod-deploy");
  assert.equal(staged.status, 0, staged.stderr);
  assert.ok(system.calls().some((call) => call.args.includes("up") && call.args.includes("--no-start") && call.image === "tuti:prod-abcdef123456"));
  assert.equal(system.calls().some((call) => (call.args.includes("up") && !call.args.includes("--no-start")) || call.args.includes("db:deploy")), false);
});

test("재개 점검 실패 시 앱을 다시 멈추고 확인 대기를 유지한다", (t) => {
  const system = fixture(t);
  assert.equal(system.run("tuti-prod-restore", [backupId, "--confirm-production-restore"]).status, 0);
  const resumed = system.run("tuti-prod-restore", ["--resume-reviewed", backupId, "REVIEW-123"], { TEST_HEALTH_FAIL: "true" });
  assert.notEqual(resumed.status, 0);
  assert.equal(existsSync(system.pending), true);
  assert.ok(system.calls().some((call) => call.args.includes("stop")));
  assert.deepEqual(system.calls().at(-1)?.args, ["update", "--restart=no", "tuti-prod"]);
});

test("복원 운영 스크립트의 셸 문법을 검증한다", () => {
  for (const name of ["tuti-prod-restore", "tuti-prod-rollback", "tuti-prod-deploy", "tuti-prod-backup", "tuti-prod-health"]) {
    execFileSync("sh", ["-n", new URL(`../scripts/ops/${name}`, import.meta.url).pathname]);
  }
});
