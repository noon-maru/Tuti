import { deleteObject, putObject } from "@/server/storage/objectStorage";
import { randomUUID } from "node:crypto";
import { HISTORIC_HARUMADI_PDF_PREFIXES } from "@/shared/harumadi/legacy";

const HARUMADI_PDF_KEY_PREFIX = "harumadi-pdfs/";

export function harumadiPdfObjectKey(ownerId: string, harumadiPdfId: string, uploadId?: string) {
  return `${HARUMADI_PDF_KEY_PREFIX}${ownerId}/${harumadiPdfId}${uploadId ? `/${uploadId}` : ""}.pdf`;
}

export function isStoredHarumadiPdf(key: string) {
  return key.startsWith(HARUMADI_PDF_KEY_PREFIX) || HISTORIC_HARUMADI_PDF_PREFIXES.some(prefix => key.startsWith(prefix));
}

export async function storeHarumadiPdf(
  ownerId: string,
  harumadiPdfId: string,
  pdf: Uint8Array,
) {
  // 같은 승인으로 재시도해도 별도 객체를 쓴다. 실패 정리가 다른 요청의 PDF를 지우지 않게 한다.
  const key = harumadiPdfObjectKey(ownerId, harumadiPdfId, randomUUID());
  await putObject({
    key,
    body: pdf,
    contentType: "application/pdf",
    cacheControl: "private, no-store",
  });
  return key;
}

export async function deleteStoredHarumadiPdf(key: string) {
  if (!isStoredHarumadiPdf(key)) return;
  await deleteObject(key);
}
