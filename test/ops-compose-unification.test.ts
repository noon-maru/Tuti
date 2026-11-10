import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("NAS Compose에서 기본·ops 프로필은 워커를 자동 시작하지 않고 기존 설치 경로도 동일하게 해석한다", async t => {
  const docker = process.env.TUTI_COMPOSE_TEST_DOCKER ?? "/usr/local/bin/docker";
  if (spawnSync(docker, ["compose", "version"], { stdio: "ignore" }).status !== 0) { t.skip("Docker Compose CLI가 필요한 설정 전용 시험"); return; }
  const directory = await mkdtemp(join(tmpdir(), "tuti-compose-fixture-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  // Only synthetic env files; never resolve the real deployment's environment.
  await writeFile(join(directory, ".env"), "NEXT_PUBLIC_API_BASE_URL=https://fixture.invalid/api\n");
  await writeFile(join(directory, ".env.production"), "NEXT_PUBLIC_API_BASE_URL=https://fixture.invalid/api\n");
  for (const name of ["docker-compose.prod.yml", "docker-compose.ops-workers.yml"]) await writeFile(join(directory, name), await readFile(name));
  const env = { PATH: process.env.PATH, HOME: directory, DOCKER_CONFIG: directory, NODE_ENV: "test" as const };
  const config = (args: string[]) => {
    const result = spawnSync(docker, ["compose", "--env-file", ".env.production", "-f", "docker-compose.prod.yml", ...args, "config", "--format", "json"], { cwd: directory, env, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  assert.deepEqual(Object.keys(config([]).services).sort(), ["app", "db"]);
  assert.deepEqual(Object.keys(config(["--profile", "ops"]).services).sort(), ["app", "db", "ops"]);
  const base = config(["--profile", "ops-workers"]);
  const legacy = config(["-f", "docker-compose.ops-workers.yml", "--profile", "ops-workers"]);
  assert.deepEqual(base, legacy);
  for (const name of ["ops-maintenance", "ops-recovery", "ops-retention"]) {
    const settings = base.services[name];
    assert.deepEqual(settings.profiles, ["ops-workers"]);
    assert.equal(settings.image, "tuti:ops"); assert.equal(settings.user, "0:0");
    assert.equal(settings.read_only, true); assert.equal(settings.mem_limit, "805306368");
    assert.deepEqual(settings.security_opt, ["no-new-privileges:true"]);
    assert.equal(settings.restart, "unless-stopped");
    assert.equal(settings.ports, undefined); assert.equal(settings.privileged, undefined);
    assert.deepEqual(Object.keys(settings.networks).sort(), ["default", "storage"]);
    const volumes = new Map<string, { source: string; read_only?: boolean }>(settings.volumes.map((v: { target: string }) => [v.target, v]));
    assert.equal(volumes.get("/run/tuti/privacy-ledger")?.source, "/var/services/homes/Tutiadmin/.tuti-secrets/privacy-ledger");
    for (const key of ["/app/scripts/run-maintenance-job.mjs", "/run/secrets/tuti-firebase-service-account.json", "/run/secrets/tuti-apns-auth-key.p8"]) assert.equal(volumes.get(key)?.read_only, true);
    assert.equal(settings.environment.PRIVACY_REPLAY_LEDGER_PATH, "/run/tuti/privacy-ledger");
    assert.equal(settings.environment.GOOGLE_APPLICATION_CREDENTIALS, "/run/secrets/tuti-firebase-service-account.json");
    assert.equal(settings.environment.APNS_PRIVATE_KEY_PATH, "/run/secrets/tuti-apns-auth-key.p8");
    assert.equal(volumes.has("/recovery"), name === "ops-recovery");
    assert.equal(volumes.has("/backup-retention"), name === "ops-retention");
    assert.equal(volumes.has("/core-backup-retention"), name === "ops-retention");
  }
});
