import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm, access } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import test from "node:test";

async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const root = await mkdtemp(join(process.cwd(), ".ops-workers-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bin = join(root, "bin");
  for (const path of [bin, ".ops-state/ops-workers", "scripts/ops", "src/server/legal"]) await mkdir(path === bin ? bin : join(root, path), { recursive: true });
  for (const path of [".env", ".env.production", "docker-compose.prod.yml", "docker-compose.ops-workers.yml", "scripts/prune-production-backups.ts", "src/server/legal/backupRetention.ts", "scripts/ops/run-maintenance-job.mjs", ".ops-state/ops-workers/enabled"]) await writeFile(join(root, path), "fixture");
  const driver = join(root, "driver.cjs");
  await writeFile(driver, `const fs=require('node:fs');const [command,...args]=process.argv.slice(2);
fs.appendFileSync(process.env.TEST_LOG,JSON.stringify({command,args})+'\\n');
if(command==='docker'){
 if(args.includes('config')){console.log(JSON.stringify({services:{'ops-maintenance':{image:'tuti:ops'},'ops-retention':{volumes:[{target:'/backup-retention',source:process.env.TEST_ROOT+'/full'}]}}}));}
 if(args[0]==='image')console.log(process.env.TEST_IMAGE||'sha256:test-image');
 if(args.includes('up'))fs.writeFileSync(process.env.TEST_STAMP,process.env.TUTI_OPS_CONFIG_DIGEST);
 if(args[0]==='inspect'){
  if(!fs.existsSync(process.env.TEST_STAMP))fs.writeFileSync(process.env.TEST_STAMP,process.env.TUTI_OPS_CONFIG_DIGEST);
  console.log((process.env.TEST_IMAGE||'sha256:test-image')+'|'+fs.readFileSync(process.env.TEST_STAMP,'utf8')+'|'+(process.env.TEST_STOPPED==='true'?'false':'true'));
 }
 if(args.includes('scripts/run-maintenance-job.mjs'))process.exit(Number(process.env.TEST_TASK_EXIT||'0'));
}
if(command==='jq'){
 const config=JSON.parse(fs.readFileSync(0,'utf8'));
 console.log(args.join(' ').includes('.image')?config.services['ops-maintenance'].image:config.services['ops-retention'].volumes[0].source);
}
`);
  for (const name of ["docker", "jq", "flock"]) await writeFile(join(bin, name), `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(driver)} ${name} "$@"\n`, { mode: 0o700 });
  await writeFile(join(bin, "id"), "#!/bin/sh\necho 0\n", { mode: 0o700 });
  const source = readFileSync("scripts/ops/tuti-ops-workers", "utf8")
    .replaceAll("/var/services/homes/Tutiadmin/source/Tuti", root)
    .replaceAll("/volume1/tuti/backups/full", join(root, "full"))
    .replaceAll("/volume1/tuti/backups/core", join(root, "core"))
    .replaceAll("/usr/bin/flock", join(bin, "flock"))
    .replaceAll("install -d -o root -g root", "install -d")
    .replaceAll("install -o root -g root", "install");
  const script = join(root, "helper.sh"); await writeFile(script, source);
  const log = join(root, "calls"); await writeFile(log, "");
  const run = (args: string[], extra: Record<string, string> = {}) => spawnSync("sh", [script, ...args], {
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, TEST_ROOT: root, TEST_LOG: log, TEST_STAMP: join(root, "stamp"), ...extra }, encoding: "utf8", timeout: 10_000,
  });
  const calls = async () => (await readFile(log, "utf8")).trim().split("\n").filter(Boolean).map(line => JSON.parse(line) as { command: string; args: string[] });
  return { root, run, calls };
}

test("반복 작업은 기존 worker에서만 exec하며 실패 종료코드를 그대로 전달한다", async t => {
  const f = await fixture(t);
  for (const mode of ["rights", "privacy", "recovery", "retention"]) { const result = f.run([mode]); assert.equal(result.status, 0, result.stderr); }
  assert.equal(f.run(["rights", "--apply"], { TEST_TASK_EXIT: "2" }).status, 2);
  const calls = await f.calls();
  assert.equal(calls.filter(call => call.args.includes("scripts/run-maintenance-job.mjs")).length, 5);
  assert.ok(calls.every(call => !call.args.includes("run") && !call.args.includes("up") && !call.args.includes("build")));
  for (const call of calls.filter(call => call.args.includes("scripts/run-maintenance-job.mjs"))) assert.ok(call.args.some(arg => arg.startsWith("TUTI_OPS_RUN_ID=")));
});

test("환경 변경·중지·미설치·복원 대기에서는 새 컨테이너로 우회하지 않고 실패한다", async t => {
  const f = await fixture(t);
  const checked = f.run(["--check"]); assert.equal(checked.status, 0, checked.stderr);
  await writeFile(join(f.root, ".env.production"), "changed");
  assert.notEqual(f.run(["privacy"]).status, 0);
  const refreshed = f.run(["--refresh"]); assert.equal(refreshed.status, 0, refreshed.stderr);
  assert.notEqual(f.run(["rights"], { TEST_STOPPED: "true" }).status, 0);
  await mkdir(join(f.root, ".ops-state/restore-privacy"));
  await writeFile(join(f.root, ".ops-state/restore-privacy/pending.env"), "pending");
  assert.notEqual(f.run(["rights"]).status, 0);
  await rm(join(f.root, ".ops-state/restore-privacy/pending.env"));
  await rm(join(f.root, ".ops-state/ops-workers/enabled"));
  assert.notEqual(f.run(["retention", "--apply"]).status, 0);
  assert.notEqual(f.run(["rights", "arbitrary-command"]).status, 0);
  assert.ok((await f.calls()).every(call => !call.args.includes("run")));
});

test("refresh는 로컬 이미지로 작업 컨테이너 3개만 시작하고 앱·DB를 재시작하지 않는다", async t => {
  const f = await fixture(t);
  const refreshed = f.run(["--refresh"]); assert.equal(refreshed.status, 0, refreshed.stderr);
  const up = (await f.calls()).find(call => call.args.includes("up"))!;
  for (const flag of ["-d", "--no-deps", "--no-build", "--pull", "never"]) assert.ok(up.args.includes(flag));
  assert.deepEqual(up.args.slice(-3), ["ops-maintenance", "ops-recovery", "ops-retention"]);
  await access(join(f.root, ".ops-state/ops-workers/enabled"));
});

test("래퍼는 기존 잠금과 실패 알림을 유지하고 복구/백업 볼륨은 분리한다", async () => {
  for (const file of ["tuti-ops-workers", "install-tuti-ops-workers", "tuti-journal-rights-maintain", "tuti-privacy-data-maintain", "tuti-privacy-ledger-backup", "tuti-prod-backup-prune", "tuti-prod-deploy", "install-legal-compliance-tools"]) {
    assert.equal(spawnSync("sh", ["-n", `scripts/ops/${file}`]).status, 0, file);
  }
  for (const name of ["tuti-journal-rights-maintain", "tuti-privacy-data-maintain", "tuti-privacy-ledger-backup", "tuti-prod-backup-prune"]) {
    const source = await readFile(`scripts/ops/${name}`, "utf8");
    assert.match(source, /maintenance.lock/); assert.match(source, /pending.env/);
    assert.doesNotMatch(source, /run --rm/); assert.match(source, /exec \/usr\/local\/sbin\/tuti-ops-workers/);
  }
  const compose = await readFile("docker-compose.ops-workers.yml", "utf8");
  assert.match(compose, /read_only: true/);
  assert.doesNotMatch(compose, /docker.sock|privileged:|ports:/);
  assert.ok(compose.indexOf("ops-recovery:") < compose.indexOf(":/recovery"));
  assert.ok(compose.indexOf("ops-retention:") < compose.indexOf(":/backup-retention"));
  for (const service of ["tuti-journal-rights", "tuti-privacy-maintenance", "tuti-privacy-ledger-backup", "tuti-backup-retention"]) assert.match(await readFile(`scripts/ops/systemd/${service}.service`, "utf8"), /OnFailure=/);
  const deploy = await readFile("scripts/ops/tuti-prod-deploy", "utf8");
  assert.ok(deploy.indexOf('docker tag "$ops_image" tuti:ops') < deploy.indexOf("tuti-ops-workers --refresh-locked"));
  const activate = await readFile("scripts/ops/tuti-privacy-activate", "utf8");
  assert.ok(activate.indexOf('mv "$pending" "$completed"') < activate.indexOf("tuti-ops-workers --refresh-locked"));
  assert.match(activate, /mv "\$completed" "\$pending"/);
});

test("작업 supervisor는 실제 종료코드를 보존하며 취소 시 자식 프로세스와 PID 파일을 정리한다", async t => {
  const root = await mkdtemp(join(process.cwd(), ".ops-supervisor-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "node_modules/.bin"), { recursive: true });
  const task = join(root, "node_modules/.bin/tsx");
  await writeFile(task, `#!${process.execPath}\nif(process.env.TEST_WAIT){require('node:fs').writeFileSync(process.env.TEST_CHILD_PID,String(process.pid));setInterval(()=>{},1000);}else process.exit(2);\n`, { mode: 0o700 });
  const runner = resolve("scripts/ops/run-maintenance-job.mjs");
  const runId = randomUUID();
  const failed = spawnSync(process.execPath, [runner, "rights"], { cwd: root, env: { ...process.env, TUTI_OPS_RUN_ID: runId }, encoding: "utf8", timeout: 10_000 });
  assert.equal(failed.status, 2, failed.stderr);
  await assert.rejects(access(`/tmp/tuti-ops-${runId}.json`));
  const cancelledId = randomUUID();
  const cancelledFile = `/tmp/tuti-ops-${cancelledId}.json.cancel`;
  await writeFile(cancelledFile, "cancelled", { mode: 0o600 });
  t.after(() => rm(cancelledFile, { force: true }));
  const cancelled = spawnSync(process.execPath, [runner, "rights"], { cwd: root, env: { ...process.env, TUTI_OPS_RUN_ID: cancelledId }, encoding: "utf8", timeout: 10_000 });
  assert.equal(cancelled.status, 143);
  await assert.rejects(access(cancelledFile));
  const id = randomUUID();
  const childPid = join(root, "child-pid");
  const running = spawn(process.execPath, [runner, "privacy"], { cwd: root, env: { ...process.env, TUTI_OPS_RUN_ID: id, TEST_WAIT: "true", TEST_CHILD_PID: childPid }, stdio: "ignore" });
  t.after(async () => { if (running.exitCode === null) running.kill("SIGKILL"); });
  const result = once(running, "exit");
  for (let attempt = 0; attempt < 100; attempt++) { try { await access(childPid); break; } catch { await new Promise(resolve => setTimeout(resolve, 10)); } }
  const pid = Number(await readFile(childPid, "utf8"));
  running.kill("SIGTERM");
  assert.equal((await result)[0], 143);
  assert.throws(() => process.kill(pid, 0));
  await assert.rejects(access(`/tmp/tuti-ops-${id}.json`));
});
