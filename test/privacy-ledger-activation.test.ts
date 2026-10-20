import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { activatePrivacyReplayCoverage, initializePrivacyReplayLedger, preparePrivacyReplayReceipt, commitPrivacyReplayReceipt, readPrivacyReplaySnapshot, verifyPrivacyReplayCoverage, privacyReplayCoverageActivated } from "../src/server/legal/privacyReplayLedger";
import { savePrivacyReplayRecovery, verifyPrivacyReplayRecovery } from "../src/server/legal/privacyReplayRecovery";
import { enablePrivacyLedgerEnvironment } from "../src/server/legal/privacyRuntimeConfig";

const start = new Date("2026-10-20T07:22:33.479Z");
const activeAt = new Date("2026-10-20T09:00:00Z");
test("환경 전환은 키·다른 기능 플래그를 보존하고 중복 설정을 거절한다", () => {
  const source = "# test\nSYNTHETIC_SECRET=keep\nSERVICE_TERMS_WORKFLOW_ENABLED=false\n  export PRIVACY_REPLAY_LEDGER_ENABLED = false\nSENSITIVE_JOURNAL_WORKFLOW_ENABLED=false\n";
  const result = enablePrivacyLedgerEnvironment(source);
  assert.equal(result, source.replace("  export PRIVACY_REPLAY_LEDGER_ENABLED = false", "PRIVACY_REPLAY_LEDGER_ENABLED=true"));
  assert.equal(enablePrivacyLedgerEnvironment(result), result);
  assert.throws(() => enablePrivacyLedgerEnvironment(`${source}\nPRIVACY_REPLAY_LEDGER_ENABLED=false`));
  assert.throws(() => enablePrivacyLedgerEnvironment("bad\0file"));
});
async function fixture(t: test.TestContext) {
  const root = await mkdtemp(join(tmpdir(), "tuti-cutover-test-"));
  const values = { PRIVACY_REPLAY_LEDGER_PATH: join(root, "ledger"), PRIVACY_REPLAY_HMAC_SECRET: "ab".repeat(32), PRIVACY_REPLAY_LEDGER_ENABLED: "true", TUTI_PRIVACY_REPLAY_OFFLINE: "true" };
  const previous = new Map(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  t.after(async () => {
    for (const [key, value] of previous) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await rm(root, { recursive: true, force: true });
  });
  await initializePrivacyReplayLedger(start);
  return { root, recovery: join(root, "recovery") };
}

test("최초 전환은 미수집 초기화 구간을 제외하고 재실행으로 수집 시작점을 바꾸지 않는다", async (t) => {
  await fixture(t);
  assert.equal(await privacyReplayCoverageActivated(), false);
  const result = await activatePrivacyReplayCoverage("CUTOVER-TEST", activeAt);
  assert.equal(result.alreadyActivated, false);
  assert.equal(result.coverageStart, activeAt.toISOString());
  assert.equal(await privacyReplayCoverageActivated(), true);
  const snapshot = await readPrivacyReplaySnapshot();
  assert.throws(() => verifyPrivacyReplayCoverage(snapshot, new Date(activeAt.getTime() - 1)));
  assert.doesNotThrow(() => verifyPrivacyReplayCoverage(snapshot, activeAt));
  assert.equal((await activatePrivacyReplayCoverage("RETRY-TEST", new Date(activeAt.getTime() + 1000))).coverageStart, activeAt.toISOString());
});

test("오프라인·근거 확인 없이 또는 기존 요청이 있는 원장은 자동 재기준화하지 않는다", async (t) => {
  await fixture(t);
  process.env.TUTI_PRIVACY_REPLAY_OFFLINE = "false";
  await assert.rejects(activatePrivacyReplayCoverage("CUTOVER-TEST", activeAt));
  process.env.TUTI_PRIVACY_REPLAY_OFFLINE = "true";
  await assert.rejects(activatePrivacyReplayCoverage("../invalid", activeAt));
  await assert.rejects(activatePrivacyReplayCoverage("CUTOVER-TEST", new Date(start.getTime() - 1)));
  await preparePrivacyReplayReceipt("account_deleted", "synthetic-subject");
  await assert.rejects(activatePrivacyReplayCoverage("CUTOVER-TEST", activeAt), /기존 요청/);
  assert.equal((await readPrivacyReplaySnapshot()).coverageStart.toISOString(), start.toISOString());
});

test("복구 사본은 별도 폴더에서 키·서명을 검증하되 운영 원장을 덮거나 자동 재개를 승인하지 않는다", async (t) => {
  const { recovery } = await fixture(t);
  await activatePrivacyReplayCoverage("CUTOVER-TEST", activeAt);
  const receipt = await preparePrivacyReplayReceipt("journal_deleted", "synthetic-owner", new Date(), "synthetic-entry");
  await commitPrivacyReplayReceipt(receipt);
  const before = await readPrivacyReplaySnapshot();
  const result = await savePrivacyReplayRecovery(recovery);
  assert.equal(result.verified, true);
  assert.equal(result.committed, 1);
  assert.equal(result.automaticRestoreAllowed, false);
  assert.deepEqual(await readPrivacyReplaySnapshot(), before);
  // 실제 환경 키가 없어도 복구 사본의 키로 서명 검사를 하고 원래 환경은 복구한다.
  delete process.env.PRIVACY_REPLAY_HMAC_SECRET;
  assert.equal((await verifyPrivacyReplayRecovery(recovery)).committed, 1);
  assert.equal(process.env.PRIVACY_REPLAY_HMAC_SECRET, undefined);
  process.env.PRIVACY_REPLAY_HMAC_SECRET = "ab".repeat(32);
  const path = join(recovery, "latest.json");
  const original = await readFile(path, "utf8");
  await writeFile(path, original.replace("committed", "prepared"));
  await assert.rejects(verifyPrivacyReplayRecovery(recovery));
  await writeFile(path, original);
  await chmod(path, 0o644);
  await assert.rejects(verifyPrivacyReplayRecovery(recovery));
  assert.deepEqual(await readPrivacyReplaySnapshot(), before);
});

test("미확인 원장·경로 조작은 복구 사본 생성을 거절하고 이전 정상 사본을 보존한다", async (t) => {
  const { recovery } = await fixture(t);
  await savePrivacyReplayRecovery(recovery);
  const before = await readFile(join(recovery, "latest.json"), "utf8");
  await writeFile(join(process.env.PRIVACY_REPLAY_LEDGER_PATH!, "unexpected"), "test");
  await assert.rejects(savePrivacyReplayRecovery(recovery));
  assert.equal(await readFile(join(recovery, "latest.json"), "utf8"), before);
  const artifact = JSON.parse(before);
  artifact.files["../outside"] = "no";
  await writeFile(join(recovery, "latest.json"), JSON.stringify(artifact));
  await assert.rejects(verifyPrivacyReplayRecovery(recovery));
});

test("운영 전환은 root·명시 실행을 요구하고 기존 이미지·복원 중지·선 검증 후 예약 순서를 유지한다", () => {
  const file = "scripts/ops/tuti-privacy-activate";
  assert.equal(spawnSync("sh", ["-n", file]).status, 0);
  assert.notEqual(spawnSync("sh", [file]).status, 0);
  assert.notEqual(spawnSync("sh", [file, "--invalid"]).status, 0);
  const source = readFileSync(file, "utf8");
  assert.match(source, /flock --exclusive/);
  assert.match(source, /restore-privacy\/pending.env/);
  assert.match(source, /--restart=no/);
  assert.match(source, /TUTI_APP_IMAGE="\$image"/);
  assert.doesNotMatch(source, /--build|SERVICE_TERMS_WORKFLOW_ENABLED=true|LEGAL_RIGHTS_WORKFLOW_ENABLED=true|SENSITIVE_JOURNAL_WORKFLOW_ENABLED=true/);
  assert.ok(source.indexOf('ops "--activate-coverage=') < source.indexOf("scripts/enable-privacy-ledger-config.ts"));
  assert.ok(source.indexOf("systemctl start tuti-backup-retention.service") < source.indexOf("systemctl enable"));
  assert.match(readFileSync("scripts/ops/systemd/tuti-privacy-ledger-backup.service", "utf8"), /OnFailure=/);
});

function activationFixture(t: test.TestContext) {
  const root = mkdtempSync(join(process.cwd(), ".privacy-activation-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const project = join(root, "project");
  const bin = join(root, "bin");
  const log = join(root, "calls.jsonl");
  mkdirSync(join(project, ".ops-state"), { recursive: true });
  mkdirSync(bin);
  const fake = join(root, "fake.cjs");
  writeFileSync(fake, `
const fs=require('node:fs');
const [command,...args]=process.argv.slice(2);
fs.appendFileSync(process.env.TEST_CALLS,JSON.stringify({command,args})+'\\n');
if(command==='id') console.log('0');
if(command==='git'&&args.includes('rev-parse')) console.log(process.env.TEST_HEAD||'abcdef123456');
if(command==='stat') console.log(process.env.TEST_BAD_PENDING==='true'?'1000:644':args.at(-1).endsWith('/pending')?'0:600':'0:700');
if(command==='install') for(let i=0;i<args.length;i++) {
  if(['-o','-g','-m'].includes(args[i])){i++;continue;}
  if(args[i]!=='-d') fs.mkdirSync(args[i],{recursive:true});
}
if(command==='docker') {
  const all=args.join(' ');
  if(args[0]==='inspect') {
    if(all.includes('Config.Image')) console.log(process.env.TEST_IMAGE||'tuti:prod-abcdef123456');
    else if(all.includes('State.Running')) console.log(process.env.TEST_RUNNING||'true');
    else console.log('TUTI_RELEASE=abcdef123456\\nPRIVACY_REPLAY_LEDGER_ENABLED=false');
  }
  if(args.includes('--coverage-mode')) console.log(process.env.TEST_COVERAGE_MODE||'unactivated');
  if(args.includes('create')&&args.includes('--no-deps')) { console.error('unknown flag: --no-deps'); process.exit(1); }
  if(args.includes('up')&&!['--no-start','--no-deps','--no-build','--pull','never'].every(flag=>args.includes(flag))) process.exit(1);
  if(args.some(arg=>arg.startsWith('--activate-coverage='))&&process.env.TEST_FAIL_COVERAGE==='true')process.exit(1);
}
if(command==='systemctl'&&args.includes('tuti-privacy-maintenance.service')&&process.env.TEST_FAIL_SERVICE==='true')process.exit(1);
`);
  for (const command of ["id", "git", "install", "docker", "systemctl", "stat"]) {
    const file = join(bin, command);
    writeFileSync(file, `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} -- ${JSON.stringify(fake)} ${command} "$@"\n`);
    chmodSync(file, 0o700);
  }
  const source = readFileSync("scripts/ops/tuti-privacy-activate", "utf8")
    .replace('project_dir="/var/services/homes/Tutiadmin/source/Tuti"', `project_dir=${JSON.stringify(project)}`)
    .replace('PATH="/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin:$PATH"', 'PATH="$PATH"')
    .replace("sh scripts/ops/install-legal-compliance-tools --apply", "true")
    .replace("sh scripts/ops/install-legal-compliance-timers --apply", "true");
  const script = join(root, "activate.sh");
  writeFileSync(script, source);
  const run = (extra: Record<string, string> = {}, mode = "--apply") => spawnSync("sh", [script, mode], {
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, TEST_CALLS: log, ...extra }, encoding: "utf8", timeout: 10000,
  });
  const calls = () => readFileSync(log, "utf8").trim().split("\n").map((line) => JSON.parse(line) as { command: string; args: string[] });
  return { run, calls, pending: join(project, ".ops-state/privacy-activation/pending") };
}

test("전환 대역 실행은 서명 검사 후 세 개인정보 작업만 시작하고 검증 실패 시 자동 재개하지 않는다", (t) => {
  const healthy = activationFixture(t);
  const succeeded = healthy.run();
  assert.equal(succeeded.status, 0, succeeded.stderr);
  const calls = healthy.calls();
  const signed = calls.findIndex((call) => call.args.some((arg) => arg.includes("app_ledger_signature=ok")));
  const enabled = calls.findIndex((call) => call.command === "systemctl" && call.args[0] === "enable");
  const created = calls.findIndex((call) => call.args.includes("up") && call.args.includes("--no-start"));
  const restartDisabled = calls.findIndex((call, index) => index > created && call.args.includes("--restart=no"));
  const started = calls.findIndex((call) => call.command === "docker" && call.args[0] === "start");
  assert.ok(created >= 0 && restartDisabled > created && started > restartDisabled && signed > started);
  assert.ok(signed >= 0 && enabled > signed);
  assert.equal(calls.some((call) => call.command === "systemctl" && call.args.includes("tuti-journal-rights.timer")), false);
  assert.equal(existsSync(healthy.pending), false);
  const broken = activationFixture(t);
  assert.notEqual(broken.run({ TEST_FAIL_COVERAGE: "true" }).status, 0);
  assert.equal(existsSync(broken.pending), true);
  assert.equal(broken.calls().some((call) => call.command === "systemctl"), false);
  assert.ok(broken.calls().some((call) => call.args.includes("--restart=no")));
  assert.equal(broken.calls().some((call) => call.args.includes("up")), false);
});

test("호스트 호환성 수정 뒤 재개는 root 대기 기록의 동일한 정지 이미지에만 허용한다", (t) => {
  const extra = { TEST_HEAD: "999999999999", TEST_RUNNING: "false", TEST_COVERAGE_MODE: "active" };
  const resumed = activationFixture(t);
  mkdirSync(join(resumed.pending, ".."), { recursive: true });
  writeFileSync(resumed.pending, "release=abcdef123456\nstarted_at=original\n");
  assert.equal(resumed.run(extra, "--resume-pending").status, 0);
  assert.equal(readFileSync(join(resumed.pending, "../completed-abcdef123456"), "utf8"), "release=abcdef123456\nstarted_at=original\n");
  assert.ok(resumed.calls().some(call => call.args.includes("--activate-coverage=PRIVACY-CUTOVER-abcdef123456")));
  for (const overrides of [{ TEST_RUNNING: "true" }, { TEST_IMAGE: "tuti:prod-other" }, { TEST_BAD_PENDING: "true" }]) {
    const blocked = activationFixture(t);
    mkdirSync(join(blocked.pending, ".."), { recursive: true });
    writeFileSync(blocked.pending, "release=abcdef123456\n");
    assert.notEqual(blocked.run({ ...extra, ...overrides }, "--resume-pending").status, 0);
    assert.equal(blocked.calls().some(call => call.args.includes("up")), false);
  }
  for (const content of ["release=../../wrong\n", "release=abcdef123456\nrelease=999999999999\n"]) {
    const invalid = activationFixture(t);
    mkdirSync(join(invalid.pending, ".."), { recursive: true });
    writeFileSync(invalid.pending, content);
    assert.notEqual(invalid.run(extra, "--resume-pending").status, 0);
  }
  const linked = activationFixture(t);
  mkdirSync(join(linked.pending, ".."), { recursive: true });
  symlinkSync("/dev/null", linked.pending);
  assert.notEqual(linked.run(extra, "--resume-pending").status, 0);
  const missing = activationFixture(t);
  assert.notEqual(missing.run(extra, "--resume-pending").status, 0);
});

test("운영 기록 기능이 중단된 이력이 있거나 첫 작업이 실패하면 예약 활성화를 승인하지 않는다", (t) => {
  const gap = activationFixture(t);
  assert.notEqual(gap.run({ TEST_COVERAGE_MODE: "active" }).status, 0);
  assert.equal(gap.calls().some((call) => call.args[0] === "stop"), false);
  const failedJob = activationFixture(t);
  assert.notEqual(failedJob.run({ TEST_FAIL_SERVICE: "true" }).status, 0);
  assert.equal(failedJob.calls().some((call) => call.command === "systemctl" && call.args[0] === "enable"), false);
});
