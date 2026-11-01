import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, symlink, rm } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import test from "node:test";

test("백업 자식 작업은 마운트 경로·인자·종료 코드·취소 경계를 유지한다", async t => {
  const root = await mkdtemp(join(process.cwd(), ".backup-worker-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const full = join(root, "full"), core = join(root, "core"), id = "20261101-102139";
  const argsFile = join(root, "args.json"), pidFile = join(root, "pid");
  for (const dir of [join(root, "node_modules/.bin"), join(full, `.${id}.partial`), join(core, `.${id}.partial`)]) await mkdir(dir, { recursive: true });
  const child = join(root, "child.cjs");
  await writeFile(child, `const fs=require('node:fs');
fs.writeFileSync(process.env.TEST_ARGS,JSON.stringify(process.argv.slice(2)));
if(process.env.TEST_WAIT==='true'){fs.writeFileSync(process.env.TEST_PID,String(process.pid));setInterval(()=>{},1000);}
else process.exit(Number(process.env.TEST_EXIT||0));
`);
  await writeFile(join(root, "node_modules/.bin/tsx"), `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(child)} "$@"\n`, { mode: 0o700 });
  const source = (await readFile("scripts/ops/run-backup-job.mjs", "utf8"))
    .replaceAll('"/backup-retention"', JSON.stringify(full))
    .replaceAll('"/core-backup-retention"', JSON.stringify(core));
  const env = { ...process.env, TEST_ARGS: argsFile, TEST_PID: pidFile };
  function run(args: string[], extra: Record<string, string> = {}) {
    return spawnSync(process.execPath, ["--input-type=module", "-e", source, "--", ...args], {
      cwd: root, env: { ...env, TUTI_OPS_RUN_ID: randomUUID(), ...extra }, encoding: "utf8", timeout: 10000,
    });
  }
  assert.equal(run(["backup-check", "full", id]).status, 0);
  for (const scope of ["full", "core"]) {
    const result = run(["backup-objects", scope, id]); assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(await readFile(argsFile, "utf8")), ["scripts/backup-object-storage.ts", join(scope === "full" ? full : core, `.${id}.partial`)]);
  }
  assert.equal(run(["backup-cleanup"]).status, 0);
  assert.deepEqual(JSON.parse(await readFile(argsFile, "utf8")), ["scripts/privacy-replay.ts", "--cleanup-objects", "--apply"]);
  assert.equal(run(["backup-objects", "core", id], { TEST_EXIT: "2" }).status, 2);
  for (const args of [["backup-objects", "full", "../escape"], ["backup-cleanup", "--apply"], ["backup-objects", "other", id], ["backup-check", "core", "20261101-000000"]]) assert.notEqual(run(args).status, 0);
  const linked = "20261101-102140";
  await symlink(join(core, `.${id}.partial`), join(full, `.${linked}.partial`));
  assert.notEqual(run(["backup-check", "full", linked]).status, 0);
  const runId = randomUUID();
  const running = spawn(process.execPath, ["--input-type=module", "-e", source, "--", "backup-cleanup"], {
    cwd: root, env: { ...env, TUTI_OPS_RUN_ID: runId, TEST_WAIT: "true" }, stdio: "ignore",
  });
  t.after(() => { if (running.exitCode === null) running.kill("SIGTERM"); });
  let childPid = 0;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { childPid = Number(await readFile(pidFile, "utf8")); break; } catch { await new Promise(r => setTimeout(r, 20)); }
  }
  assert.ok(childPid > 1);
  const exited = once(running, "exit"); running.kill("SIGTERM");
  assert.equal((await exited)[0], 143);
  assert.throws(() => process.kill(childPid, 0), { code: "ESRCH" });
  await assert.rejects(readFile(`/tmp/tuti-ops-${runId}.json`));
});
