import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import test from "node:test";

async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const root = await mkdtemp(join(process.cwd(), ".job-alert-cooldown-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bin = join(root, "bin"); await mkdir(bin);
  await writeFile(join(bin, "id"), '#!/bin/sh\necho 0\n', { mode: 0o700 });
  await writeFile(join(bin, "logger"), '#!/bin/sh\nexit 0\n', { mode: 0o700 });
  await writeFile(join(bin, "date"), '#!/bin/sh\nprintf "%s\\n" "$TEST_NOW"\n', { mode: 0o700 });
  await writeFile(join(bin, "docker"), '#!/bin/sh\necho send >> "$TEST_ROOT/calls"\nif [ "$TEST_WAIT" = true ]; then sleep 0.2; fi\nexit "${TEST_EXIT:-0}"\n', { mode: 0o700 });
  const script = join(root, "notify.sh");
  const source = (await readFile("scripts/ops/tuti-legal-job-failure-notify", "utf8"))
    .replaceAll("/var/services/homes/Tutiadmin/source/Tuti", root)
    .replaceAll("/usr/bin/logger", "logger")
    .replaceAll("install -d -o root -g root", "install -d");
  await writeFile(script, source);
  const env = (now: number, extra = {}) => ({ ...process.env, PATH: `${bin}:${process.env.PATH}`, TEST_ROOT: root, TEST_NOW: String(now), ...extra });
  const run = (now: number, extra = {}, args: string[] = []) => spawnSync("sh", [script, ...args], { env: env(now, extra), encoding: "utf8", timeout: 5000 });
  const calls = async () => { try { return (await readFile(join(root, "calls"), "utf8")).trim().split("\n").length; } catch { return 0; } };
  return { root, script, env, run, calls };
}
test("첫 발송 후 1시간은 서로 다른 작업의 같은 Slack 알림도 억제한다", async t => {
  const f = await fixture(t);
  const first = f.run(10000); assert.equal(first.status, 0, first.stderr);
  for (const now of [10030,10060,12000,13599]) assert.equal(f.run(now).status, 0);
  assert.equal(await f.calls(), 1);
  assert.equal(f.run(13600).status, 0);
  assert.equal(await f.calls(), 2);
});
test("전송 실패는 성공으로 기록하지 않고 5분 후 재시도한다", async t => {
  const f = await fixture(t);
  assert.equal(f.run(10000, { TEST_EXIT: "1" }).status, 1);
  await assert.rejects(readFile(join(f.root, ".ops-state/job-failure-alert/last-success")));
  assert.equal(f.run(10030).status, 0); assert.equal(await f.calls(), 1);
  assert.equal(f.run(10300).status, 0); assert.equal(await f.calls(), 2);
  assert.equal(f.run(10330).status, 0); assert.equal(await f.calls(), 2);
});
test("동시 장애·프로세스 재시작에도 한 번만 발송하고 시계 역행은 영구 억제하지 않는다", async t => {
  const f = await fixture(t);
  const children = Array.from({ length: 5 }, () => spawn("sh", [f.script], { env: f.env(10000, { TEST_WAIT: "true" }), stdio: "ignore" }));
  const results = await Promise.all(children.map(child => once(child, "exit")));
  assert.ok(results.every(([code]) => code === 0)); assert.equal(await f.calls(), 1);
  assert.equal(f.run(9990).status, 0); assert.equal(await f.calls(), 2);
  assert.notEqual(f.run(10000, {}, ["--arbitrary"]).status, 0);
});
