import { createHash } from "node:crypto";

type Manifest = { objects: Array<{ key: string; file: string; size: number; sha256: string; contentType?: string | null; cacheControl?: string | null }> };
export type RestoreReferences = {
  accounts: number; journals: number; books: number; migrations: number;
  failedMigrations: number; unvalidatedForeignKeys: number; postgresMajor: number;
  images: string[]; pdfs: Array<{ key: string; pageCount: number }>;
  externalImages: number; embeddedImages: number;
};
type Dependencies = {
  read: (file: string) => Promise<Buffer>;
  put: (item: Manifest["objects"][number], bytes: Buffer) => Promise<void>;
  get: (key: string) => Promise<Buffer>;
  image: (bytes: Buffer) => Promise<void>;
  pdf: (bytes: Buffer) => Promise<number>;
};

// 호출자는 무결성을 확인한 고정 백업만 전달한다. 결과에 본문·키·개인 식별자는 포함하지 않는다.
export async function verifyIsolatedRestore(manifest: Manifest, refs: RestoreReferences, io: Dependencies) {
  if (refs.postgresMajor !== 17 || refs.failedMigrations !== 0 || refs.unvalidatedForeignKeys !== 0 || refs.migrations < 1) throw new Error("DATABASE_VALIDATION_FAILED");
  const keys = new Set<string>();
  let total = 0;
  for (const item of manifest.objects) {
    if (typeof item.key !== "string" || !item.key || item.key.length > 4096 || keys.has(item.key) ||
        item.file !== `${Buffer.from(item.key).toString("base64url")}.object` ||
        !/^[A-Za-z0-9_-]+\.object$/.test(item.file) || !Number.isSafeInteger(item.size) || item.size < 0 || item.size > 32 * 1024 * 1024) throw new Error("OBJECT_METADATA_INVALID");
    total += item.size;
    if (total > 128 * 1024 * 1024) throw new Error("SANDBOX_CAPACITY_EXCEEDED");
    keys.add(item.key);
  }
  for (const key of refs.images) if (!keys.has(key)) throw new Error("IMAGE_REFERENCE_MISSING");
  for (const pdf of refs.pdfs) if (!keys.has(pdf.key) || !Number.isSafeInteger(pdf.pageCount) || pdf.pageCount < 1) throw new Error("PDF_REFERENCE_MISSING");
  let imagesDecoded = 0;
  let pdfsDecoded = 0;
  for (const item of manifest.objects) {
    const bytes = await io.read(item.file);
    const hash = (data: Buffer) => createHash("sha256").update(data).digest("hex");
    if (bytes.length !== item.size || hash(bytes) !== item.sha256) throw new Error("SOURCE_OBJECT_MISMATCH");
    await io.put(item, bytes);
    const restored = await io.get(item.key);
    if (restored.length !== item.size || hash(restored) !== item.sha256) throw new Error("RESTORED_OBJECT_MISMATCH");
    if (refs.images.includes(item.key)) { await io.image(restored); imagesDecoded++; }
    const pdf = refs.pdfs.find(value => value.key === item.key);
    if (pdf) { if (await io.pdf(restored) !== pdf.pageCount) throw new Error("PDF_PAGE_COUNT_MISMATCH"); pdfsDecoded++; }
  }
  return { scope: "isolated-production-backup-restore", databaseRestored: true, accounts: refs.accounts, journals: refs.journals, books: refs.books,
    migrations: refs.migrations, objectsRestoredAndReadBack: keys.size, objectBytesVerified: total, imagesDecoded, pdfsDecoded,
    externalImagesNotFetched: refs.externalImages, embeddedImagesNotDecoded: refs.embeddedImages,
    productionDatabaseTouched: false, productionObjectStorageTouched: false, privacyReplayPerformed: false,
    scopeLimit: "격리 복원·객체 재조회·기록 연결·이미지 해독·PDF 페이지 수 검사. 웹 로그인·화면·운영 복구 재개·삭제 원장 재반영 시험은 아님" };
}
