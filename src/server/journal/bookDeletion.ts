import { prisma } from "@/server/db/prisma";
import { deleteStoredJournalBook } from "@/server/journal/bookStorage";
import { commitPrivacyReplayReceipt, preparePrivacyReplayReceipt, privacyReplayEnabled } from "@/server/legal/privacyReplayLedger";

export async function deleteJournalBook(ownerId: string, bookId: string, replay = false) {
  const book = await prisma.journalBook.findFirst({ where: { id: bookId, ownerId }, select: { id: true, objectKey: true } });
  if (!book) return false;
  const receipt = replay ? null : await preparePrivacyReplayReceipt("journal_book_deleted", ownerId, new Date(), bookId);
  const strict = replay || privacyReplayEnabled();
  if (strict) await deleteStoredJournalBook(book.objectKey);
  await prisma.journalBook.delete({ where: { id: book.id } });
  await commitPrivacyReplayReceipt(receipt);
  if (!strict) {
    try { await deleteStoredJournalBook(book.objectKey); }
    catch { console.error("삭제한 기록집 파일의 후속 정리가 필요합니다."); }
  }
  return true;
}
