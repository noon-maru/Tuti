import { deleteObject, putObject } from "@/server/storage/objectStorage";

const JOURNAL_BOOK_KEY_PREFIX = "journal-books/";

export function journalBookObjectKey(ownerId: string, bookId: string) {
  return `${JOURNAL_BOOK_KEY_PREFIX}${ownerId}/${bookId}.pdf`;
}

export function isStoredJournalBook(key: string) {
  return key.startsWith(JOURNAL_BOOK_KEY_PREFIX);
}

export async function storeJournalBookPdf(
  ownerId: string,
  bookId: string,
  pdf: Uint8Array,
) {
  const key = journalBookObjectKey(ownerId, bookId);
  await putObject({
    key,
    body: pdf,
    contentType: "application/pdf",
    cacheControl: "private, no-store",
  });
  return key;
}

export async function deleteStoredJournalBook(key: string) {
  if (!isStoredJournalBook(key)) return;
  await deleteObject(key);
}
