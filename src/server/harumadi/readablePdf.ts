import { prisma } from "@/server/db/prisma";
import { sensitiveJournalPolicyEnabled } from "@/server/journal/sensitivePolicy";
import { SENSITIVE_JOURNAL_CONSENT_VERSION } from "@/shared/legal/sensitiveJournalPolicy";

export async function findReadableHarumadiPdf(ownerId: string, harumadiPdfId: string) {
  const harumadiPdf = await prisma.harumadiPdf.findFirst({ where: { id: harumadiPdfId, ownerId }, select: {
    id: true, title: true, entryIds: true, pageCount: true, createdAt: true,
    sensitivePolicyVersion: true, coverStyle: true, coverReady: true,
  } });
  if (!harumadiPdf) return { harumadiPdf: null, status: 404, error: "하루마디를 찾지 못했어요." };
  const withdrawn = await prisma.journalEntry.count({ where: { ownerId, id: { in: harumadiPdf.entryIds }, sensitiveWithdrawnAt: { not: null } } });
  if (withdrawn) return { harumadiPdf: null, status: 410, error: "동의 철회로 정리 중인 하루마디예요." };
  if (sensitiveJournalPolicyEnabled() && harumadiPdf.sensitivePolicyVersion !== SENSITIVE_JOURNAL_CONSENT_VERSION) {
    return { harumadiPdf: null, status: 409, error: "이전 하루마디는 기록 보호 확인 후 새로 만들어주세요." };
  }
  return { harumadiPdf, status: 200, error: null };
}
