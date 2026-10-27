import { prisma } from "@/server/db/prisma";
import { deleteStoredHarumadiPdf } from "@/server/harumadi/pdfStorage";
import { deleteStoredJournalImage } from "@/server/journal/imageStorage";
import { commitPrivacyReplayReceipt, preparePrivacyReplayReceipt } from "@/server/legal/privacyReplayLedger";

export async function withdrawSensitiveJournal(ownerId: string, entryId: string) {
  const entry = await prisma.journalEntry.findFirst({ where: { id: entryId, ownerId }, select: { sensitiveContent: true, sensitiveWithdrawnAt: true } });
  if (!entry) return { found: false, pending: false };
  if (entry.sensitiveContent !== true && !entry.sensitiveWithdrawnAt) throw new Error("민감정보 처리 동의가 없는 마디입니다.");
  // 복구 방지 근거를 먼저 준비한다. 준비 실패 시 철회 완료를 표시하지 않는다.
  const receipt = await preparePrivacyReplayReceipt("journal_sensitive_withdrawn", ownerId, new Date(), entryId);
  await prisma.journalEntry.updateMany({
    where: { id: entryId, ownerId, sensitiveWithdrawnAt: null },
    data: { sensitiveWithdrawnAt: new Date(), sensitiveConsentVersion: null, sensitiveConsentedAt: null,
      publicId: null, publishedAt: null, publicationStatus: "private",
      // 파일 저장소 장애가 있어도 DB의 원문과 장소는 먼저 파기한다.
      // 사진 키와 소유자/기록 ID만 파일·연관 PDF 정리에 필요한 동안 유지한다.
      title: "", content: "", placeId: null, placeName: "남긴 공간",
      visitedAt: new Date(),
    },
  });
  // 원장은 삭제 완료 증명이 아니라 복구 시 재이행할 의무다. 파일 실패에도 유지한다.
  await commitPrivacyReplayReceipt(receipt);
  // 차단 상태는 파일 삭제 실패와 독립적으로 남는다. 예약 작업에서 이어서 정리한다.
  try {
    await purgeWithdrawnSensitiveJournal(ownerId, entryId);
    return { found: true, pending: false };
  } catch {
    return { found: true, pending: true };
  }
}

export async function purgeWithdrawnSensitiveJournal(ownerId: string, entryId: string) {
  const entry = await prisma.journalEntry.findFirst({ where: { id: entryId, ownerId, sensitiveWithdrawnAt: { not: null } }, select: { image: true } });
  if (!entry) return;
  const harumadiPdfs = await prisma.harumadiPdf.findMany({ where: { ownerId, entryIds: { has: entryId } }, select: { id: true, objectKey: true } });
  for (const harumadiPdf of harumadiPdfs) {
    const receipt = await preparePrivacyReplayReceipt("harumadi_deleted", ownerId, new Date(), harumadiPdf.id);
    // 대상 파일 삭제가 실패하면 DB 키를 남겨 재시도할 수 있게 한다.
    await deleteStoredHarumadiPdf(harumadiPdf.objectKey);
    await prisma.harumadiPdf.deleteMany({ where: { id: harumadiPdf.id, ownerId } });
    await commitPrivacyReplayReceipt(receipt);
  }
  await deleteStoredJournalImage(entry.image);
  await prisma.$transaction(async (tx) => {
    await tx.journalShareTrace.deleteMany({ where: { entryId } });
    await tx.contentReport.updateMany({ where: { entryId }, data: { entryId: null } });
    await tx.journalEntry.deleteMany({ where: { id: entryId, ownerId, sensitiveWithdrawnAt: { not: null } } });
  });
}

export async function maintainSensitiveWithdrawals(apply = false) {
  const entries = await prisma.journalEntry.findMany({ where: { sensitiveWithdrawnAt: { not: null } }, select: { id: true, ownerId: true }, take: 100, orderBy: { sensitiveWithdrawnAt: "asc" } });
  let completed = 0;
  let failed = 0;
  if (apply) for (const entry of entries) {
    try {
      const receipt = await preparePrivacyReplayReceipt("journal_sensitive_withdrawn", entry.ownerId, new Date(), entry.id);
      await purgeWithdrawnSensitiveJournal(entry.ownerId, entry.id);
      await commitPrivacyReplayReceipt(receipt);
      completed++;
    } catch { failed++; }
  }
  return { mode: apply ? "applied" : "dry-run", inspected: entries.length, completed, failed };
}
