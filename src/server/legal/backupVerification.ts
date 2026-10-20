import { constants, createReadStream } from "node:fs";
import { lstat, open, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";

const allowedFile = (name: string) => /^(manifest\.txt|migrations\.txt|postgres\.dump|objects\.manifest\.json|objects\/[A-Za-z0-9_-]+\.object)$/.test(name);
const failure = () => new Error("백업 파일·목록·무결성 확인 실패");

// 외부 연결·복원·삭제 없이 선택한 사본을 스트림으로 검사한다. 원문·객체 키는 결과에 싣지 않는다.
export async function verifyBackupFiles(root: string) {
  const dir = await lstat(root);
  if (!dir.isDirectory() || dir.isSymbolicLink()) throw failure();
  async function boundedText(name: string, max: number) {
    const file = await open(join(root, name), constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const info = await file.stat();
      if (!info.isFile() || info.size > max) throw failure();
      return await file.readFile("utf8");
    } finally { await file.close(); }
  }
  const expected = new Map<string, string>();
  for (const line of (await boundedText("checksums.sha256", 32 * 1024 * 1024)).trim().split("\n")) {
    const match = /^([a-f0-9]{64}) [ *](?:\.\/)?(.+)$/.exec(line);
    if (!match || !allowedFile(match[2]) || expected.has(match[2])) throw failure();
    expected.set(match[2], match[1]);
  }
  const seen = new Set<string>();
  const hashes = new Map<string, { size: number; hash: string }>();
  async function inspectDirectory(relative = "") {
    const entries = await readdir(join(root, relative), { withFileTypes: true });
    for (const entry of entries) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw failure();
      if (entry.isDirectory() && name === "objects") { await inspectDirectory(name); continue; }
      if (!entry.isFile()) throw failure();
      if (name === "checksums.sha256") continue;
      if (!allowedFile(name) || !expected.has(name)) throw failure();
      const file = await open(join(root, name), constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const info = await file.stat();
        if (!info.isFile()) throw failure();
        const hash = createHash("sha256");
        const stream = createReadStream("", { fd: file.fd, autoClose: false });
        for await (const chunk of stream) hash.update(chunk);
        const value = hash.digest("hex");
        if (value !== expected.get(name)) throw failure();
        hashes.set(name, { size: info.size, hash: value });
        seen.add(name);
      } finally { await file.close(); }
    }
  }
  await inspectDirectory();
  if (seen.size !== expected.size) throw failure();
  for (const required of ["manifest.txt", "postgres.dump", "migrations.txt", "objects.manifest.json"]) if (!seen.has(required)) throw failure();
  const metadata = new Map((await boundedText("manifest.txt", 16384)).trim().split("\n").map(line => {
    const at = line.indexOf("=");
    if (at < 1) throw failure();
    return [line.slice(0, at), line.slice(at + 1)] as const;
  }));
  if (metadata.get("backup_version") !== "1" || metadata.get("restore_scope") !== "database-and-journal-objects" ||
      metadata.get("secrets_included") !== "false" || !Number.isFinite(Date.parse(metadata.get("created_at") ?? ""))) throw failure();
  const manifest = JSON.parse(await boundedText("objects.manifest.json", 16 * 1024 * 1024));
  if (manifest.version !== 1 || !Array.isArray(manifest.objects) || manifest.count !== manifest.objects.length) throw failure();
  const objectFiles = new Set<string>();
  let totalBytes = 0;
  for (const item of manifest.objects) {
    if (typeof item.key !== "string" || !item.key || item.key.length > 4096 ||
        item.file !== `${Buffer.from(item.key).toString("base64url")}.object`) throw failure();
    const name = `objects/${item.file}`;
    const actual = hashes.get(name);
    if (objectFiles.has(name) || !actual || actual.size !== item.size || actual.hash !== item.sha256) throw failure();
    objectFiles.add(name);
    totalBytes += item.size;
  }
  if (manifest.totalBytes !== totalBytes || [...seen].filter(name => name.startsWith("objects/")).length !== objectFiles.size) throw failure();
  const dump = await open(join(root, "postgres.dump"), constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const magic = Buffer.alloc(5);
    const result = await dump.read(magic, 0, 5, 0);
    if (result.bytesRead !== 5 || magic.toString("ascii") !== "PGDMP") throw failure();
  } finally { await dump.close(); }
  return { scope: "backup-file-integrity-only", filesVerified: seen.size, objectsVerified: objectFiles.size, objectBytesVerified: totalBytes, archiveHeaderVerified: true, liveDatabaseTouched: false, liveObjectStorageTouched: false, restorePerformed: false };
}
