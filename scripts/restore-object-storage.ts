import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { putObject } from "../src/server/storage/objectStorage";

type BackupManifest = {
  version: number;
  objects: Array<{
    key: string;
    file: string;
    size: number;
    sha256: string;
    contentType: string | null;
    cacheControl: string | null;
  }>;
};

const source = process.argv[2];

if (!source) {
  throw new Error("복구할 백업 디렉터리가 필요합니다.");
}

const backupRoot = resolve(source);
const manifest = JSON.parse(
  await readFile(resolve(backupRoot, "objects.manifest.json"), "utf8"),
) as BackupManifest;

if (manifest.version !== 1 || !Array.isArray(manifest.objects)) {
  throw new Error("지원하지 않는 오브젝트 백업 형식입니다.");
}

let restored = 0;

for (const object of manifest.objects) {
  if (!/^[A-Za-z0-9_-]+\.object$/.test(object.file)) {
    throw new Error(`안전하지 않은 백업 파일명입니다: ${object.file}`);
  }

  const bytes = await readFile(resolve(backupRoot, "objects", object.file));
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  if (bytes.byteLength !== object.size || sha256 !== object.sha256) {
    throw new Error(`오브젝트 백업 무결성 검증 실패: ${object.key}`);
  }

  await putObject({
    key: object.key,
    body: bytes,
    contentType: object.contentType ?? "application/octet-stream",
    cacheControl: object.cacheControl ?? "private, max-age=31536000, immutable",
  });
  restored += 1;

  if (restored % 100 === 0) {
    console.log(`오브젝트 ${restored}개 복구 완료`);
  }
}

console.log(`오브젝트 스토리지 복구 완료: ${restored}개`);
