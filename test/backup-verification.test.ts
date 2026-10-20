import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { BackupVerificationError, verifyBackupFiles } from "../src/server/legal/backupVerification";

async function fixture(t: test.TestContext) {
  const root = await mkdtemp(join(tmpdir(), "tuti-backup-verify-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "objects"));
  const key = "synthetic/photo";
  const file = `${Buffer.from(key).toString("base64url")}.object`;
  const bytes = Buffer.from("synthetic image");
  const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
  const files: Record<string, string | Buffer> = {
    "manifest.txt": "backup_version=1\ncreated_at=2026-10-20T00:00:00Z\nsecrets_included=false\nrestore_scope=database-and-journal-objects\n",
    "postgres.dump": "PGDMP synthetic only", "migrations.txt": "synthetic-migration\n",
    "objects.manifest.json": JSON.stringify({ version: 1, count: 1, totalBytes: bytes.length, objects: [{ key, file, size: bytes.length, sha256: hash(bytes) }] }),
    [`objects/${file}`]: bytes,
  };
  const save = async () => {
    for (const [name, data] of Object.entries(files)) await writeFile(join(root, name), data);
    await writeFile(join(root, "checksums.sha256"), Object.entries(files).map(([name, data]) => `${hash(data)}  ./${name}\n`).join(""));
  };
  await save();
  return { root, files, file, save };
}

test("백업 검증은 파일·객체 무결성만 확인하며 원문·키·복구 완료를 출력하지 않는다", async t => {
  const f = await fixture(t);
  const before = await readFile(join(f.root, "checksums.sha256"), "utf8");
  const result = await verifyBackupFiles(f.root);
  assert.equal(result.filesVerified, 5);
  assert.equal(result.objectsVerified, 1);
  assert.equal(result.restorePerformed, false);
  assert.equal(result.liveDatabaseTouched, false);
  assert.doesNotMatch(JSON.stringify(result), /synthetic|photo|key|bucket/);
  assert.equal(await readFile(join(f.root, "checksums.sha256"), "utf8"), before);
});

test("변조·누락·목록 밖 자료·심볼릭 링크·경로 조작을 거절한다", async t => {
  for (const change of [
    async (f: Awaited<ReturnType<typeof fixture>>) => writeFile(join(f.root, `objects/${f.file}`), "modified"),
    async (f: Awaited<ReturnType<typeof fixture>>) => rm(join(f.root, "postgres.dump")),
    async (f: Awaited<ReturnType<typeof fixture>>) => writeFile(join(f.root, "unexpected"), "unknown"),
    async (f: Awaited<ReturnType<typeof fixture>>) => { await rm(join(f.root, `objects/${f.file}`)); await symlink("/dev/null", join(f.root, `objects/${f.file}`)); },
    async (f: Awaited<ReturnType<typeof fixture>>) => writeFile(join(f.root, "checksums.sha256"), `${"a".repeat(64)}  ../outside\n`),
  ]) { const f = await fixture(t); await change(f); await assert.rejects(verifyBackupFiles(f.root)); }
});

test("실패 진단은 검사 단계·허용 오류 코드만 남기고 파일 경로와 객체 키를 숨긴다", async t => {
  const f = await fixture(t);
  await rm(join(f.root, "checksums.sha256"));
  await assert.rejects(verifyBackupFiles(f.root), error => {
    assert.ok(error instanceof BackupVerificationError);
    assert.equal(error.stage, "checksum-list");
    assert.equal(error.reason, "ENOENT");
    assert.doesNotMatch(JSON.stringify(error), /synthetic|photo|checksums|\/tmp|tuti-backup/);
    return true;
  });
  await f.save();
  await writeFile(join(f.root, `objects/${f.file}`), "tampered");
  await assert.rejects(verifyBackupFiles(f.root), error => {
    assert.ok(error instanceof BackupVerificationError);
    assert.equal(error.stage, "file-hashes-and-inventory");
    assert.equal(error.reason, "SHA256_MISMATCH");
    assert.doesNotMatch(error.message, /synthetic|photo|object$/);
    return true;
  });
});

test("모든 파일 해시가 맞아도 객체 manifest 불일치·중복과 잘못된 dump를 거절한다", async t => {
  for (const field of ["size", "sha256", "count", "totalBytes", "duplicate", "file", "dump"]) {
    const f = await fixture(t);
    const manifest = JSON.parse(String(f.files["objects.manifest.json"]));
    if (field === "size") manifest.objects[0].size++;
    if (field === "sha256") manifest.objects[0].sha256 = "a".repeat(64);
    if (field === "count") manifest.count++;
    if (field === "totalBytes") manifest.totalBytes++;
    if (field === "duplicate") { manifest.objects.push(manifest.objects[0]); manifest.count++; }
    if (field === "file") manifest.objects[0].file = "../outside";
    if (field === "dump") f.files["postgres.dump"] = "not an archive";
    f.files["objects.manifest.json"] = JSON.stringify(manifest);
    await f.save();
    await assert.rejects(verifyBackupFiles(f.root));
  }
  assert.equal(spawnSync("sh", ["-n", "scripts/ops/tuti-prod-backup-verify"]).status, 0);
});

test("목록·파일 형식 실패와 실제 해시 불일치를 구별하되 이름은 노출하지 않는다", async t => {
  const scenarios = [
    { reason: "UNEXPECTED_DIRECTORY", change: async (f: Awaited<ReturnType<typeof fixture>>) => mkdir(join(f.root, "private-extra-directory")) },
    { reason: "UNEXPECTED_FILE", change: async (f: Awaited<ReturnType<typeof fixture>>) => writeFile(join(f.root, "private-extra-file"), "test") },
    { reason: "CHECKSUM_ENTRY_MISSING", change: async (f: Awaited<ReturnType<typeof fixture>>) => rm(join(f.root, `objects/${f.file}`)) },
    { reason: "SYMLINK_NOT_ALLOWED", change: async (f: Awaited<ReturnType<typeof fixture>>) => symlink("/dev/null", join(f.root, "private-link")) },
  ];
  for (const scenario of scenarios) {
    const f = await fixture(t);
    await scenario.change(f);
    await assert.rejects(verifyBackupFiles(f.root), error => {
      assert.ok(error instanceof BackupVerificationError);
      assert.equal(error.stage, "file-hashes-and-inventory");
      assert.equal(error.reason, scenario.reason);
      assert.doesNotMatch(JSON.stringify(error), /private|synthetic|photo|\/tmp/);
      return true;
    });
  }
});

test("필수 파일 누락은 고정된 표준 파일명만 진단에 포함한다", async t => {
  const f = await fixture(t);
  delete f.files["objects.manifest.json"];
  await rm(join(f.root, "objects.manifest.json"));
  await f.save();
  await assert.rejects(verifyBackupFiles(f.root), error => {
    assert.ok(error instanceof BackupVerificationError);
    assert.equal(error.reason, "REQUIRED_FILE_MISSING");
    assert.deepEqual(error.missingRequiredFiles, ["objects.manifest.json"]);
    assert.doesNotMatch(JSON.stringify(error), /synthetic|photo|\/tmp/);
    return true;
  });
});
