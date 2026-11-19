import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, rm, access } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

test("공개 카탈로그 준비는 고정 해시·SHA·백업·읽기 전용 사본과 유지보수 잠금을 지킨다", async t => {
  const root = await mkdtemp(join(process.cwd(), ".dog-rollout-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bin = join(root, "bin"), log = join(root, "calls"), revision = "a".repeat(40);
  await mkdir(bin); await mkdir(join(root, "scripts/ops"), { recursive: true }); await mkdir(join(root, ".ops-state"));
  await writeFile(join(root, ".env.production"), "");
  const original = await readFile("scripts/ops/prepare-dog-catalog", "utf8");
  const fixture = "synthetic public data only\n", hash = createHash("sha256").update(fixture).digest("hex");
  const source = original.replace(/^(kor|basics|detail_a|detail_b)_hash=[a-f0-9]+$/gm, (_, name: string) => `${name}_hash=${hash}`);
  await writeFile(join(root, "scripts/ops/prepare-dog-catalog"), source);
  const paths = [...source.matchAll(/^(?:kor|basics|detail_a|detail_b)=(\.tourism-data\/[^\n]+)$/gm)].map(match => join(root, match[1]));
  for (const path of paths) { await mkdir(join(path, ".."), { recursive: true }); await writeFile(path, fixture, { mode: 0o600 }); }
  const driver = join(root, "driver.cjs");
  await writeFile(driver, `const fs=require('node:fs');const [cmd,...args]=process.argv.slice(2);let locked=false;try{locked=fs.readlinkSync('/proc/self/fd/9').endsWith('/.ops-state/maintenance.lock')}catch{}
fs.appendFileSync(process.env.TEST_LOG,JSON.stringify({cmd,args,locked,image:process.env.TUTI_OPS_IMAGE})+'\\n');
if(cmd==='id')console.log(process.env.TEST_UID||'0');
if(cmd==='git'){if(args.includes('branch'))console.log('main');if(args.includes('rev-parse'))console.log(process.env.TEST_WRONG_SHA?'b'.repeat(40):process.env.TEST_REVISION);if(args.includes('status')&&process.env.TEST_DIRTY)console.log(' M fixture');}
if(cmd==='backup'&&process.env.TEST_BACKUP_FAIL)process.exit(1);
if(cmd==='docker'&&args.includes('deploy')&&process.env.TEST_MIGRATION_FAIL)process.exit(1);
`);
  for (const command of ["id", "git", "docker"]) await writeFile(join(bin, command), `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(driver)} ${command} "$@"\n`, { mode: 0o700 });
  await writeFile(join(root, "scripts/ops/tuti-prod-backup"), `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(driver)} backup\n`);
  const run = async (mode: string, extra: Record<string, string> = {}) => {
    await writeFile(log, "");
    const result = spawnSync("sh", [join(root, "scripts/ops/prepare-dog-catalog"), mode, revision], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, TEST_LOG: log, TEST_REVISION: revision, ...extra }, encoding: "utf8", timeout: 20000 });
    const calls = (await readFile(log, "utf8")).trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
    return { result, calls };
  };
  const checked = await run("--check"); assert.equal(checked.result.status, 0, checked.result.stderr);
  assert.equal(checked.calls.some(call => call.cmd === "backup" || call.args.includes("--apply") || call.args.includes("deploy")), false);
  const prepared = await run("--apply"); assert.equal(prepared.result.status, 0, prepared.result.stderr);
  const backupIndex = prepared.calls.findIndex(call => call.cmd === "backup");
  const migrationIndex = prepared.calls.findIndex(call => call.args.includes("deploy"));
  assert.ok(backupIndex >= 0 && migrationIndex > backupIndex);
  assert.ok(prepared.calls.slice(migrationIndex).filter(call => call.cmd === "docker").every(call => call.locked));
  const operations = prepared.calls.filter(call => call.args.includes("compose"));
  assert.ok(operations.every(call => call.image === `tuti:ops-${revision.slice(0, 12)}` && call.args.includes("1000:1000")));
  assert.ok(operations.every(call => call.args[call.args.indexOf("--volume") + 1].endsWith(":/public-catalog:ro")));
  const staged = operations[0].args[operations[0].args.indexOf("--volume") + 1].split(":")[0];
  await assert.rejects(access(staged));
  assert.match(prepared.result.stdout, /"publicDataOnly":true/);
  for (const flag of ["TEST_DIRTY", "TEST_WRONG_SHA", "TEST_BACKUP_FAIL"]) {
    const failed = await run("--apply", { [flag]: "true" }); assert.notEqual(failed.result.status, 0);
    assert.equal(failed.calls.some(call => call.args.includes("deploy") || call.args.includes("--apply")), false);
  }
  const migrationFailed = await run("--apply", { TEST_MIGRATION_FAIL: "true" });
  assert.notEqual(migrationFailed.result.status, 0); assert.equal(migrationFailed.calls.some(call => call.args.includes("--apply")), false);
  await writeFile(paths[0], "tampered");
  const changed = await run("--apply"); assert.notEqual(changed.result.status, 0); assert.equal(changed.calls.some(call => call.cmd === "backup"), false);
});

test("카탈로그 준비는 외부 수집·개발 DB 복제·앱 교체·스키마 역적용을 수행하지 않는다", async () => {
  const source = await readFile("scripts/ops/prepare-dog-catalog", "utf8");
  assert.doesNotMatch(source, /docker-compose\.dev|pg_dump|pg_restore|--collect|--sample-api|migrate reset|\bdown\b|up -d|build --pull/);
  assert.match(source, /scripts\/check-dog-recommendation-readiness.ts --require-data/);
  assert.match(source, /scripts\/verify-dog-recommendations.ts/);
  assert.equal(spawnSync("sh", ["-n", "scripts/ops/prepare-dog-catalog"]).status, 0);
});
