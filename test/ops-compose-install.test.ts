import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("운영 구성 전환은 검증·백업·사용자 Git FF·워커 갱신을 같은 유지보수 잠금 안에서 수행한다", async t => {
  const root = await mkdtemp(join(process.cwd(), ".compose-install-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const project = join(root, "project"), bin = join(root, "bin");
  for (const path of [project, join(project, ".ops-state"), bin, join(root, "scripts/ops")]) await mkdir(path, { recursive: true });
  for (const file of ["docker-compose.prod.yml", "docker-compose.ops-workers.yml"]) await writeFile(join(project, file), "old fixture");
  await writeFile(join(project, ".env.production"), "");
  const revision = "a".repeat(40), log = join(root, "calls");
  const driver = join(root, "driver.cjs");
  await writeFile(driver, `const fs=require('node:fs');const [command,...args]=process.argv.slice(2);
let lock=null;try{lock=fs.readlinkSync('/proc/self/fd/9')}catch{}
fs.appendFileSync(process.env.TEST_LOG,JSON.stringify({command,args,lock})+'\\n');
if(command==='su'){
 const separator=args.indexOf('--');
 if(separator<0||args[separator+1]!=='Tutiadmin'||args[separator+2]!=='git')process.exit(64);
 const git=args.slice(separator+3), operation=git[2];
 if(process.env.TEST_SU_FAILED)process.exit(1);
 if(operation==='branch')console.log('main');
 if(operation==='rev-parse')console.log(process.env.TEST_REVISION);
 if(operation==='status'&&process.env.TEST_DIRTY)console.log(' M fixture');
 if(operation==='merge-base'&&process.env.TEST_DIVERGED)process.exit(1);
}
if(command==='docker'&&process.env.TEST_CONFIG_FAILED)process.exit(1);
if(command==='worker'&&args.includes('--refresh-locked')&&process.env.TEST_REFRESH_FAILED)process.exit(1);
`);
  for (const command of ["su", "docker", "worker"]) await writeFile(join(bin, command), `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(driver)} ${command} "$@"\n`, { mode: 0o700 });
  await writeFile(join(bin, "id"), "#!/bin/sh\necho 0\n", { mode: 0o700 });
  const script = join(root, "scripts/ops/install-ops-compose-unification");
  const source = (await readFile("scripts/ops/install-ops-compose-unification", "utf8"))
    .replaceAll("/var/services/homes/Tutiadmin/source/Tuti", project)
    .replaceAll("/usr/local/sbin/tuti-ops-workers", join(bin, "worker"))
    .replaceAll("install -d -o root -g root", "install -d");
  await writeFile(script, source);
  const run = async (extra: Record<string, string> = {}) => {
    await writeFile(log, "");
    const result = spawnSync("sh", [script, "--apply", revision], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, TEST_REVISION: revision, TEST_LOG: log, ...extra }, encoding: "utf8", timeout: 10_000 });
    const calls = (await readFile(log, "utf8")).trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
    return { result, calls };
  };
  const success = await run(); assert.equal(success.result.status, 0, success.result.stderr + JSON.stringify(success.calls));
  const calls = success.calls;
  const config = calls.findIndex(c => c.command === "docker"), merge = calls.findIndex(c => c.command === "su" && c.args.includes("merge"));
  const refresh = calls.findIndex(c => c.command === "worker" && c.args.includes("--refresh-locked"));
  assert.ok(config >= 0 && config < merge && merge < refresh);
  assert.ok(calls.slice(config).every(c => c.lock === join(project, ".ops-state/maintenance.lock")));
  assert.match(success.result.stdout, /앱·DB 재시작/);
  assert.ok(calls.filter(c => c.command === "docker").every(c => c.args.includes("config") && c.args.includes("--quiet")));
  for (const flag of ["TEST_SU_FAILED", "TEST_DIRTY", "TEST_DIVERGED", "TEST_CONFIG_FAILED"]) {
    const failed = await run({ [flag]: "true" }); assert.notEqual(failed.result.status, 0);
    assert.equal(failed.calls.some(c => c.command === "worker" || (c.command === "su" && c.args.includes("merge"))), false);
  }
  const refreshFailed = await run({ TEST_REFRESH_FAILED: "true" });
  assert.notEqual(refreshFailed.result.status, 0); assert.doesNotMatch(refreshFailed.result.stdout, /운영 Compose 통합 완료/);
  await mkdir(join(project, ".ops-state/privacy-activation"), { recursive: true });
  await writeFile(join(project, ".ops-state/privacy-activation/pending"), "fixture");
  const pending = await run(); assert.notEqual(pending.result.status, 0);
  assert.equal(pending.calls.some(c => c.command === "worker" || c.command === "docker" || c.args.includes("merge")), false);
});

test("실제 su 옵션 파서는 Git의 -C와 --porcelain을 su 옵션으로 해석하지 않는다", async t => {
  const su = "/usr/bin/su";
  if (spawnSync(su, ["--help"], { stdio: "ignore" }).status !== 0) { t.skip("su CLI가 필요한 인자 파서 시험"); return; }
  const source = await readFile("scripts/ops/install-ops-compose-unification", "utf8");
  const fn = source.match(/^git_owner\(\) \{.*\}$/m)?.[0];
  assert.ok(fn);
  // A nonexistent target stops before authentication or command execution.
  // This exercises the installed su parser, without requesting root access.
  const command = fn.replace("su -s", `${su} -s`).replace("Tutiadmin", "tuti-su-parser-missing-user");
  const result = spawnSync("sh", ["-c", `${command}\ngit_owner -C '/path with spaces' status --porcelain`], { encoding: "utf8", input: "", timeout: 3000, env: { ...process.env, LC_ALL: "C" } });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stderr, /invalid option|unrecognized option|illegal option/);
  assert.match(result.stderr, /tuti-su-parser-missing-user/);
  assert.match(result.stderr, /does not exist|unknown user|not exist/);
});
