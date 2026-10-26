import { deleteObject, putObject } from "@/server/storage/objectStorage";
import { HISTORIC_HARUMADI_PDF_PREFIXES } from "@/shared/harumadi/legacy";

const HARUMADI_PDF_KEY_PREFIX = "harumadi-pdfs/";

export function harumadiPdfObjectKey(ownerId: string, harumadiPdfId: string) {
  return `${HARUMADI_PDF_KEY_PREFIX}${ownerId}/${harumadiPdfId}.pdf`;
}

export function isStoredHarumadiPdf(key: string) {
  return key.startsWith(HARUMADI_PDF_KEY_PREFIX) || HISTORIC_HARUMADI_PDF_PREFIXES.some(prefix => key.startsWith(prefix));
}

export async function storeHarumadiPdf(
  ownerId: string,
  harumadiPdfId: string,
  pdf: Uint8Array,
) {
  const key = harumadiPdfObjectKey(ownerId, harumadiPdfId);
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
