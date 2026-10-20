import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { verifyBackupFiles } from "../src/server/legal/backupVerification";

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
