import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("전체 스키마와 실제 Garage의 사진·PDF를 복원한 뒤 원장으로 삭제·철회를 재반영한다", { timeout: 180000 }, async (t) => {
  if (process.env.PRIVACY_RESTORE_INTEGRATION !== "true") { t.skip("수동 격리 복원 workflow에서만 실행한다."); return; }
  assert.equal(process.env.GITHUB_ACTIONS, "true", "운영 NAS에서 실행하지 않는다.");
  assert.equal(process.env.RUNNER_ENVIRONMENT, "github-hosted", "self-hosted runner는 허용하지 않는다.");
  assert.notEqual(process.getuid?.(), 0);
  assert.equal(process.env.POSTGRES_BIN_DIR, "/usr/lib/postgresql/17/bin");
  const binary = (name: string) => join(process.env.POSTGRES_BIN_DIR!, name);
  for (const name of ["initdb", "pg_ctl", "psql", "createdb", "pg_dump", "pg_restore"]) {
    assert.equal(spawnSync(binary(name), ["--version"]).status, 0, `${name} 실행 파일 필수`);
  }
  const root = mkdtempSync(join(tmpdir(), "tuti-privacy-restore-"));
  const data = join(root, "data");
  const socket = join(root, "socket");
  const ledger = join(root, "ledger");
  const backup = join(root, "backup");
  mkdirSync(socket, { mode: 0o700 });
  mkdirSync(backup, { mode: 0o700 });
  const dbName = "privacy_source";
  const restoredName = "privacy_restored";
  const connection = ["-h", socket, "-p", "15483", "-U", "privacy_test"];
  const connectionUrl = (name: string) => `postgresql://privacy_test@localhost:15483/${name}?host=${encodeURIComponent(socket)}&sslmode=disable`;
  const settings = {
    LANG: "C", LC_ALL: "C", PGOPTIONS: "", PGSSLMODE: "disable", PGSERVICE: undefined,
    PGSERVICEFILE: undefined, PGPASSWORD: undefined, PGPASSFILE: undefined,
    DATABASE_URL: connectionUrl(dbName), NODE_ENV: "test", PRIVACY_REPLAY_LEDGER_ENABLED: "true",
    PRIVACY_REPLAY_LEDGER_PATH: ledger, PRIVACY_REPLAY_HMAC_SECRET: randomBytes(32).toString("hex"),
    OBJECT_STORAGE_ENABLED: "true", OBJECT_STORAGE_ENDPOINT: "http://127.0.0.1:49300",
    OBJECT_STORAGE_REGION: "privacy-ci", OBJECT_STORAGE_BUCKET: "tuti-privacy-restore-ci",
    OBJECT_STORAGE_ACCESS_KEY_ID: "GK0123456789abcdef01234567",
    OBJECT_STORAGE_SECRET_ACCESS_KEY: "2".repeat(64),
    LEGAL_RIGHTS_WORKFLOW_ENABLED: "false", SERVICE_TERMS_WORKFLOW_ENABLED: "false",
    SERVICE_TERMS_ENFORCEMENT_ENABLED: "false", SENSITIVE_JOURNAL_WORKFLOW_ENABLED: "false",
    ANDROID_PUSH_ENABLED: "false", IOS_PUSH_ENABLED: "false", LEGAL_RIGHTS_ALERT_WEBHOOK_URL: "",
  };
  const previous = new Map(Object.keys(settings).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(settings)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  const env = { ...process.env };
  const query = (database: string, sql: string) => execFileSync(binary("psql"), ["--no-psqlrc", ...connection, "-d", database, "-v", "ON_ERROR_STOP=1", "-A", "-t", "-f", "-"], {
    input: sql, env, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  }).trim();
  const child = (script: string, args: string[] = [], extra: Record<string, string> = {}) => spawnSync(process.execPath, ["--import", "tsx", script, ...args], {
    env: { ...env, DATABASE_URL: connectionUrl(restoredName), TUTI_PRIVACY_REPLAY_OFFLINE: "true", ...extra },
    encoding: "utf8", timeout: 30000,
  });
  const cleanup: { disconnect?: () => Promise<void> } = {};
  t.after(async () => {
    try { await cleanup.disconnect?.(); }
    finally {
      const storage = (globalThis as { tutiObjectStorageClient?: { destroy(): void } }).tutiObjectStorageClient;
      storage?.destroy();
      delete (globalThis as { prisma?: unknown }).prisma;
      delete (globalThis as { tutiObjectStorageClient?: unknown }).tutiObjectStorageClient;
      // 종료를 확인하기 전 임시 DB 파일을 삭제하지 않는다.
      if (existsSync(join(data, "postmaster.pid"))) {
        const stopped = spawnSync(binary("pg_ctl"), ["-D", data, "-m", "fast", "-w", "-t", "10", "stop"], { env });
        assert.equal(stopped.status, 0, `임시 DB를 보존하며 종료 확인 필요: ${root}`);
      }
      rmSync(root, { recursive: true, force: true });
      for (const [key, value] of previous) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    }
  });
  execFileSync(binary("initdb"), ["-D", data, "-U", "privacy_test", "--no-locale", "--encoding=UTF8", "--auth-local=trust", "--auth-host=reject"], { env, stdio: "pipe" });
  execFileSync(binary("pg_ctl"), ["-D", data, "-l", join(root, "server.log"), "-o", `-k ${socket} -p 15483 -c listen_addresses='' -c max_connections=12 -c max_wal_senders=0 -c shared_buffers=16MB`, "-w", "-t", "15", "start"], { env, stdio: "pipe" });
  assert.equal(Math.floor(Number(query("postgres", "SHOW server_version_num")) / 10000), 17);
  execFileSync(binary("createdb"), [...connection, dbName], { env, stdio: "pipe" });
  const migrations = readdirSync("prisma/migrations").filter((name) => existsSync(join("prisma/migrations", name, "migration.sql"))).sort();
  for (const name of migrations) {
    query(dbName, readFileSync(join("prisma/migrations", name, "migration.sql"), "utf8"));
  }
  t.diagnostic(`PostgreSQL 17 전체 마이그레이션 ${migrations.length}개 적용`);
  const { PrismaClient } = await import("../../src/generated/prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const client = new PrismaClient({ adapter: new PrismaPg({ host: socket, port: 15483, user: "privacy_test", database: dbName, ssl: false }) });
  cleanup.disconnect = () => client.$disconnect();
  (globalThis as { prisma?: unknown }).prisma = client;
  const { putObject, getObject, listObjects, verifyObjectStorageConnection } = await import("../../src/server/storage/objectStorage");
  const { initializePrivacyReplayLedger, readPrivacyReplaySnapshot } = await import("../../src/server/legal/privacyReplayLedger");
  const { forceDeleteJournalEntry } = await import("../../src/server/journal/service");
  const { deleteJournalBook } = await import("../../src/server/journal/bookDeletion");
  const { withdrawSensitiveJournal } = await import("../../src/server/journal/sensitiveWithdrawal");
  const { deleteUserAccount } = await import("../../src/server/admin/users");
  const { recordLocationConsent } = await import("../../src/server/location/compliance");
  const { LOCATION_TERMS_VERSION } = await import("../../src/shared/location/terms");
  await verifyObjectStorageConnection();
  assert.equal((await listObjects()).objects.length, 0, "전용 검증 버킷은 비어 있어야 한다.");
  await initializePrivacyReplayLedger();
  for (const id of ["owner", "removed", "unrelated"]) {
    await client.user.create({ data: { id, tokenHash: `privacy-test-${id}` } });
    await client.pushDevice.create({ data: { id, userId: id, installationId: id, platform: "android", token: `synthetic-${id}` } });
  }
  const objects = new Map<string, Buffer>();
  for (const [id, ownerId] of [["delete", "owner"], ["sensitive", "owner"], ["keep", "unrelated"], ["account", "removed"]]) {
    const image = `journal-images/${ownerId}/${id}/photo.webp`;
    objects.set(image, Buffer.from(`SYNTHETIC-PHOTO-${id}`));
    await client.journalEntry.create({ data: {
      id, ownerId, title: `test-${id}`, content: `synthetic story ${id}`, image, crowd: "미정", placeName: "시험 공간", difficulty: "미정", visitedAt: new Date(),
      sensitiveContent: id === "sensitive", sensitiveConsentVersion: id === "sensitive" ? "sensitive-journal-v1" : null,
      sensitiveConsentedAt: id === "sensitive" ? new Date() : null,
    } });
  }
  for (const [id, ownerId, entryId] of [["delete", "owner", "delete"], ["sensitive", "owner", "sensitive"], ["keep", "unrelated", "keep"], ["account", "removed", "account"]]) {
    const objectKey = `journal-books/${ownerId}/${id}.pdf`;
    objects.set(objectKey, Buffer.from(`%PDF-1.4\nSYNTHETIC-${id}\n%%EOF`));
    await client.journalBook.create({ data: { id, ownerId, title: `test-${id}`, entryIds: [entryId], objectKey, pageCount: 1 } });
  }
  for (const [key, body] of objects) await putObject({ key, body, contentType: key.endsWith(".pdf") ? "application/pdf" : "image/webp" });
  await recordLocationConsent({ user: { id: "owner", role: "user" }, status: "accepted", termsVersion: LOCATION_TERMS_VERSION, ageConfirmed: true, clientPlatform: "web" });
  for (const locationUsed of [true, false]) await client.recommendationRun.create({ data: {
    id: locationUsed ? "located" : "region", userId: "owner", algorithmVersion: "test", answers: {}, state: {}, candidates: [], locationUsed,
  } });
  const backupAt = new Date();
  execFileSync(binary("pg_dump"), [...connection, "-d", dbName, "--format=custom", "--file", join(backup, "postgres.dump")], { env, stdio: "pipe" });
  const objectBackup = child("scripts/backup-object-storage.ts", [backup]);
  assert.equal(objectBackup.status, 0, objectBackup.stderr);
  assert.equal(JSON.parse(readFileSync(join(backup, "objects.manifest.json"), "utf8")).count, 8);
  assert.equal(await forceDeleteJournalEntry("delete"), true);
  assert.equal(await deleteJournalBook("owner", "delete"), true);
  assert.deepEqual(await withdrawSensitiveJournal("owner", "sensitive"), { found: true, pending: false });
  await deleteUserAccount("removed");
  await recordLocationConsent({ user: { id: "owner", role: "user" }, status: "withdrawn", termsVersion: LOCATION_TERMS_VERSION, ageConfirmed: false, clientPlatform: "web" });
  assert.deepEqual((await client.journalEntry.findMany({ select: { id: true } })).map((entry) => entry.id), ["keep"]);
  assert.equal((await readPrivacyReplaySnapshot()).unresolved, 0);
  assert.equal((await listObjects()).objects.length, 2);
  t.diagnostic("테스트 자료로 기록·PDF·계정 삭제와 위치 철회를 실제 서비스 함수로 실행");

  execFileSync(binary("createdb"), [...connection, restoredName], { env, stdio: "pipe" });
  execFileSync(binary("pg_restore"), [...connection, "-d", restoredName, "--exit-on-error", join(backup, "postgres.dump")], { env, stdio: "pipe" });
  const objectRestore = child("scripts/restore-object-storage.ts", [backup]);
  assert.equal(objectRestore.status, 0, objectRestore.stderr);
  assert.equal(query(restoredName, "SELECT count(*) FROM journal_entries"), "4");
  for (const [key, expected] of objects) assert.deepEqual(Buffer.from(await (await getObject(key)).body.transformToByteArray()), expected);
  const replayArgs = [`--backup-at=${backupAt.toISOString()}`, "--apply"];
  const dryRun = child("scripts/privacy-replay.ts", [replayArgs[0]]);
  assert.equal(dryRun.status, 0, dryRun.stderr);
  assert.equal(JSON.parse(dryRun.stdout).dryRun, true);
  assert.equal(query(restoredName, "SELECT count(*) FROM journal_entries"), "4");
  assert.equal((await listObjects()).objects.length, 8);
  const failed = child("scripts/privacy-replay.ts", replayArgs, { OBJECT_STORAGE_ENDPOINT: "http://127.0.0.1:1" });
  assert.notEqual(failed.status, 0, "실제 저장소 연결 실패를 성공으로 취급하지 않는다.");
  assert.equal(query(restoredName, "SELECT count(*) FROM users WHERE id='removed'"), "1");
  const replay = child("scripts/privacy-replay.ts", replayArgs);
  assert.equal(replay.status, 0, replay.stderr);
  assert.equal(query(restoredName, "SELECT string_agg(id,',' ORDER BY id) FROM journal_entries"), "keep");
  assert.equal(query(restoredName, "SELECT string_agg(id,',' ORDER BY id) FROM journal_books"), "keep");
  assert.equal(query(restoredName, "SELECT count(*) FROM users WHERE id='removed'"), "0");
  assert.equal(query(restoredName, "SELECT string_agg(id,',' ORDER BY id) FROM recommendation_runs"), "region");
  assert.equal(query(restoredName, "SELECT status FROM location_consent_events WHERE user_id='owner' ORDER BY created_at DESC LIMIT 1"), "withdrawn");
  const maintenance = child("scripts/maintain-privacy-data.ts", ["--restore", "--apply"]);
  assert.equal(maintenance.status, 0, maintenance.stderr);
  assert.equal(query(restoredName, "SELECT count(*) FROM push_devices"), "0", "복원된 알림 등록은 재등록을 요구한다.");
  const kept = ["journal-books/unrelated/keep.pdf", "journal-images/unrelated/keep/photo.webp"];
  assert.deepEqual((await listObjects()).objects.map((item) => item.key).sort(), kept);
  for (const key of kept) assert.deepEqual(Buffer.from(await (await getObject(key)).body.transformToByteArray()), objects.get(key));
  assert.equal(query(dbName, "SELECT count(*) FROM journal_entries"), "1", "원본 시험 DB를 복원으로 덮어쓰지 않는다.");
  const repeated = child("scripts/privacy-replay.ts", replayArgs);
  assert.equal(repeated.status, 0, repeated.stderr);
  assert.deepEqual((await listObjects()).objects.map((item) => item.key).sort(), kept);
  t.diagnostic("복원 DB·객체 재반영, 삭제 대상 제거·무관한 자료 바이트 보존·실패 및 재실행 검증 완료");
});
