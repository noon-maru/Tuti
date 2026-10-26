import { prisma } from "@/server/db/prisma";
import { sensitiveJournalPolicyEnabled } from "./sensitivePolicy";
import { SENSITIVE_JOURNAL_CONSENT_VERSION } from "@/shared/legal/sensitiveJournalPolicy";

export async function findReadableBook(ownerId: string, bookId: string) {
  const book = await prisma.journalBook.findFirst({ where: { id: bookId, ownerId }, select: {
    id: true, title: true, entryIds: true, pageCount: true, createdAt: true,
    sensitivePolicyVersion: true, coverStyle: true, coverReady: true,
  } });
  if (!book) return { book: null, status: 404, error: "기록집을 찾지 못했어요." };
  const withdrawn = await prisma.journalEntry.count({ where: { ownerId, id: { in: book.entryIds }, sensitiveWithdrawnAt: { not: null } } });
  if (withdrawn) return { book: null, status: 410, error: "동의 철회로 정리 중인 기록집이에요." };
  if (sensitiveJournalPolicyEnabled() && book.sensitivePolicyVersion !== SENSITIVE_JOURNAL_CONSENT_VERSION) {
    return { book: null, status: 409, error: "이전 기록집은 기록 보호 확인 후 새로 만들어주세요." };
  }
  return { book, status: 200, error: null };
}
