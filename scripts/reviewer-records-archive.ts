import { createHash } from "node:crypto";
import { lstat, open, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { prisma } from "../src/server/db/prisma";
import { getObject } from "../src/server/storage/objectStorage";

const ROOT = "/reviewer-transfer";
export const SOURCE_USER_ID = "f0181f76-8ee4-43cc-b4c4-0d214afc4aeb";
const SOURCE_EMAIL = "openapi@tuti.today";
const EXPECTED_RECORDS = 3;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
let stage = "arguments";
class ArchiveSourceError extends Error { readonly code = "UNSUPPORTED_IMAGE_SOURCE"; }
const digest = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
type Image = { file: string; bytes: number; sha256: string; contentType: string };
type RecordData = { sourceEntryId: string; title: string; content: string; crowd: string; difficulty: string; theme: string; placeId: string | null; placeName: string; visitedAt: string; image: Image };
type Archive = { version: 1; purpose: "operator-owned-review-test-content"; sourceUserId: string; sourceFingerprint: string; exportedAt: string; reviewBy: string; importPolicy: "new-account-new-ids-private-no-consent-copy"; records: RecordData[] };

export async function sourceSnapshot() {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const users = await tx.user.findMany({ where: { id: SOURCE_USER_ID, role: "user", authIdentities: { some: { email: { equals: SOURCE_EMAIL, mode: "insensitive" } } } }, select: { id: true }, take: 2 });
    if (users.length !== 1) throw new Error("기존 심사용 일반 계정을 정확히 확인하지 못했습니다.");
    if (await tx.harumadiPdf.count({ where: { ownerId: SOURCE_USER_ID } })) throw new Error("하루마디가 생겼습니다. 보관 범위를 다시 확인해주세요.");
    const records = await tx.journalEntry.findMany({ where: { ownerId: SOURCE_USER_ID }, orderBy: { id: "asc" }, select: {
      id: true, title: true, content: true, image: true, crowd: true, difficulty: true, theme: true,
      placeId: true, placeName: true, visitedAt: true, updatedAt: true, sensitiveContent: true, sensitiveWithdrawnAt: true,
    } });
    if (records.length !== EXPECTED_RECORDS || records.some(record => !record.image || record.sensitiveContent || record.sensitiveWithdrawnAt)) throw new Error("승인한 기록 3개·이미지 3개와 다르거나 별도 민감정보 확인이 필요합니다.");
    return { records, fingerprint: digest(JSON.stringify(records)) };
  }, { isolationLevel: "RepeatableRead" });
}

export async function decodeImage(bytes: Uint8Array) {
  if (!bytes.byteLength || bytes.byteLength > MAX_IMAGE_BYTES) throw new Error("이미지 용량이 보관 범위를 벗어납니다.");
  const image = sharp(bytes, { limitInputPixels: 16_000_000, failOn: "warning" });
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height || !["jpeg", "png", "webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1) > 1) throw new Error("지원하지 않는 이미지입니다.");
  await image.stats();
  return `image/${metadata.format}`;
}

export async function imageBytes(source: string): Promise<Uint8Array> {
  if (source.startsWith("journal-images/")) {
    const object = await getObject(source);
    if (object.contentLength !== undefined && object.contentLength > MAX_IMAGE_BYTES) throw new Error("이미지 용량이 너무 큽니다.");
    return object.body.transformToByteArray();
  }
  const embedded = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/.exec(source);
  if (embedded) {
    const encoded = embedded[1].replace(/\s/g, "");
    if (encoded.length > MAX_IMAGE_BYTES * 1.4) throw new Error("이미지 용량이 너무 큽니다.");
    const bytes = Buffer.from(encoded, "base64");
    if (bytes.toString("base64").replace(/=+$/, "") !== encoded.replace(/=+$/, "")) throw new Error("이미지 인코딩이 올바르지 않습니다.");
    return bytes;
  }
  // 외부 URL은 자격정보를 보내거나 임의 서버를 조회하지 않는다. 실제 형식을 먼저 확인한다.
  throw new ArchiveSourceError("외부 URL 등 별도 확인이 필요한 이미지가 있습니다. 원문 URL을 출력하지 말고 보관 방식을 확인해주세요.");
}

export function validateArchive(value: unknown): asserts value is Archive {
  const a = value as Archive | null;
  if (!a || a.version !== 1 || a.purpose !== "operator-owned-review-test-content" || a.sourceUserId !== SOURCE_USER_ID || a.importPolicy !== "new-account-new-ids-private-no-consent-copy" || !/^[a-f0-9]{64}$/.test(a.sourceFingerprint) || !Number.isFinite(Date.parse(a.exportedAt)) || !Number.isFinite(Date.parse(a.reviewBy)) || !Array.isArray(a.records) || a.records.length !== EXPECTED_RECORDS) throw new Error("보관 문서 형식이 올바르지 않습니다.");
  const only = (object: object, keys: string[]) => Object.keys(object).every(key => keys.includes(key));
  if (!only(a, ["version", "purpose", "sourceUserId", "sourceFingerprint", "exportedAt", "reviewBy", "importPolicy", "records"])) throw new Error("보관 범위 밖 메타데이터가 있습니다.");
  const ids = new Set<string>();
  const files = new Set<string>();
  for (const record of a.records) {
    if (!record || typeof record.sourceEntryId !== "string" || !record.sourceEntryId || ids.has(record.sourceEntryId) ||
        ![record.title, record.content, record.crowd, record.difficulty, record.theme, record.placeName].every(text => typeof text === "string") ||
        !(record.placeId === null || typeof record.placeId === "string") || !Number.isFinite(Date.parse(record.visitedAt)) ||
        !record.image || !/^image-0[1-3]\.bin$/.test(record.image.file) || files.has(record.image.file) ||
        !Number.isInteger(record.image.bytes) || record.image.bytes < 1 || record.image.bytes > MAX_IMAGE_BYTES ||
        !/^[a-f0-9]{64}$/.test(record.image.sha256) || !/^image\/(jpeg|png|webp)$/.test(record.image.contentType)) throw new Error("보관한 기록 또는 이미지 목록이 올바르지 않습니다.");
    if (!only(record, ["sourceEntryId", "title", "content", "crowd", "difficulty", "theme", "placeId", "placeName", "visitedAt", "image"]) || !only(record.image, ["file", "bytes", "sha256", "contentType"])) throw new Error("인증·동의·공개 정보는 이전 사본에 포함하지 않습니다.");
    ids.add(record.sourceEntryId); files.add(record.image.file);
  }
}

export async function verifyArchiveFiles(root: string, compareSource: boolean) {
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || (rootStat.mode & 0o077)) throw new Error("보관 폴더는 전용 0700 디렉터리여야 합니다.");
  const allowed = ["archive.json", "archive.sha256", "image-01.bin", "image-02.bin", "image-03.bin"];
  const names = await readdir(root);
  if (names.length !== allowed.length || names.some(name => !allowed.includes(name))) throw new Error("보관 파일이 누락되었거나 목록 밖 파일이 있습니다.");
  for (const name of names) {
    const stat = await lstat(join(root, name));
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || (stat.mode & 0o077) || stat.size > 80 * 1024 * 1024) throw new Error("보관 파일 접근 권한·형식이 올바르지 않습니다.");
  }
  const raw = await readFile(join(root, "archive.json"));
  const archiveHash = digest(raw);
  if ((await readFile(join(root, "archive.sha256"), "utf8")).trim() !== archiveHash) throw new Error("보관 원문 해시가 일치하지 않습니다.");
  const archive: unknown = JSON.parse(raw.toString("utf8"));
  validateArchive(archive);
  for (const record of archive.records) {
    const bytes = await readFile(join(root, record.image.file));
    if (bytes.byteLength !== record.image.bytes || digest(bytes) !== record.image.sha256 || await decodeImage(bytes) !== record.image.contentType) throw new Error("이미지 무결성 또는 해독 검사에 실패했습니다.");
  }
  if (compareSource && (await sourceSnapshot()).fingerprint !== archive.sourceFingerprint) throw new Error("보관 후 원본 기록이 달라졌습니다. 계정을 삭제하지 마세요.");
  return { scope: "reviewer-records-export-verification-only", archiveHash, records: archive.records.length, imagesDecoded: archive.records.length, sourceCompared: compareSource, databaseChanged: false, accountDeleted: false, termsActivated: false };
}

async function main() {
  const mode = process.argv[2];
  if (process.argv.length !== 3 || !["export", "verify", "verify-with-source"].includes(mode)) throw new Error("export | verify | verify-with-source 중 하나를 지정해주세요.");
  if (mode === "export") {
    stage = "destination-check";
    const stat = await lstat(ROOT);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) || (await readdir(ROOT)).length) throw new Error("새 전용 빈 보관 폴더가 필요합니다. 기존 사본은 덮어쓰지 않습니다.");
    stage = "read-only-source-snapshot";
    const snapshot = await sourceSnapshot();
    const records: RecordData[] = [];
    for (const [i, entry] of snapshot.records.entries()) {
      stage = `image-read-${i + 1}`;
      const bytes = await imageBytes(entry.image!);
      stage = `image-decode-${i + 1}`;
      const contentType = await decodeImage(bytes);
      const file = `image-0${i + 1}.bin`;
      stage = `image-save-${i + 1}`;
      await writeDurable(join(ROOT, file), bytes);
      records.push({ sourceEntryId: entry.id, title: entry.title, content: entry.content, crowd: entry.crowd, difficulty: entry.difficulty, theme: entry.theme, placeId: entry.placeId, placeName: entry.placeName, visitedAt: entry.visitedAt.toISOString(), image: { file, contentType, bytes: bytes.byteLength, sha256: digest(bytes) } });
    }
    const archive: Archive = { version: 1, purpose: "operator-owned-review-test-content", sourceUserId: SOURCE_USER_ID, sourceFingerprint: snapshot.fingerprint, exportedAt: new Date().toISOString(), reviewBy: new Date(Date.now() + 30 * 86400000).toISOString(), importPolicy: "new-account-new-ids-private-no-consent-copy", records };
    validateArchive(archive);
    const raw = JSON.stringify(archive, null, 2) + "\n";
    stage = "manifest-save";
    await writeDurable(join(ROOT, "archive.json"), raw);
    await writeDurable(join(ROOT, "archive.sha256"), digest(raw) + "\n");
    const directory = await open(ROOT, "r");
    try { await directory.sync(); } finally { await directory.close(); }
  }
  stage = "archive-and-source-verification";
  console.log(JSON.stringify(await verifyArchiveFiles(ROOT, mode !== "verify")));
}
async function writeDurable(path: string, bytes: string | Uint8Array) {
  const file = await open(path, "wx", 0o600);
  try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(JSON.stringify({ stage, reason: error instanceof ArchiveSourceError ? error.code : "VALIDATION_OR_IO_FAILED", accountDeleted: false })); console.error("심사용 기록 보관·검증에 실패했습니다. 원문·이미지 키·인증정보는 출력하지 않습니다. 기존 계정은 삭제하지 마세요."); process.exitCode = 1; }).finally(() => prisma.$disconnect());
}
