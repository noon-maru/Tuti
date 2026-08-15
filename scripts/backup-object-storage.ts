import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  getObject,
  getObjectStorageBucket,
  isObjectStorageEnabled,
  listObjects,
} from "../src/server/storage/objectStorage";

type BackupObject = {
  key: string;
  file: string;
  size: number;
  sha256: string;
  contentType: string | null;
  cacheControl: string | null;
  etag: string | null;
  lastModified: string | null;
};

const destination = process.argv[2];

if (!destination) {
  throw new Error("백업 대상 디렉터리가 필요합니다.");
}

const backupRoot = resolve(destination);
const objectDirectory = resolve(backupRoot, "objects");
await mkdir(objectDirectory, { recursive: true, mode: 0o700 });

if (!isObjectStorageEnabled()) {
  await writeManifest([]);
  console.log("오브젝트 스토리지가 비활성화되어 빈 객체 목록을 기록했습니다.");
  process.exit(0);
}

const manifest: BackupObject[] = [];
let continuationToken: string | undefined;

do {
  const page = await listObjects(continuationToken);

  for (const item of page.objects) {
    const object = await getObject(item.key);
    const bytes = Buffer.from(await object.body.transformToByteArray());
    const file = `${Buffer.from(item.key).toString("base64url")}.object`;
    const sha256 = createHash("sha256").update(bytes).digest("hex");

    await writeFile(resolve(objectDirectory, file), bytes, { mode: 0o600 });
    manifest.push({
      key: item.key,
      file,
      size: bytes.byteLength,
      sha256,
      contentType: object.contentType ?? null,
      cacheControl: object.cacheControl ?? null,
      etag: object.etag ?? item.etag ?? null,
      lastModified: object.lastModified?.toISOString() ??
        item.lastModified?.toISOString() ?? null,
    });

    if (manifest.length % 100 === 0) {
      console.log(`오브젝트 ${manifest.length}개 백업 완료`);
    }
  }

  continuationToken = page.nextContinuationToken;
} while (continuationToken);

await writeManifest(manifest);
console.log(`오브젝트 스토리지 백업 완료: ${manifest.length}개`);

async function writeManifest(objects: BackupObject[]) {
  await writeFile(
    resolve(backupRoot, "objects.manifest.json"),
    `${JSON.stringify({
      version: 1,
      bucket: isObjectStorageEnabled() ? getObjectStorageBucket() : null,
      createdAt: new Date().toISOString(),
      count: objects.length,
      totalBytes: objects.reduce((sum, object) => sum + object.size, 0),
      objects,
    }, null, 2)}\n`,
    { mode: 0o600 },
  );
}
