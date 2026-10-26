import { prisma } from "@/server/db/prisma";
import { deleteStoredHarumadiPdf } from "@/server/harumadi/pdfStorage";
import { commitPrivacyReplayReceipt, preparePrivacyReplayReceipt, privacyReplayEnabled } from "@/server/legal/privacyReplayLedger";

export async function deleteHarumadiPdf(ownerId: string, harumadiPdfId: string, replay = false) {
  const harumadiPdf = await prisma.harumadiPdf.findFirst({ where: { id: harumadiPdfId, ownerId }, select: { id: true, objectKey: true } });
  if (!harumadiPdf) return false;
  const receipt = replay ? null : await preparePrivacyReplayReceipt("harumadi_deleted", ownerId, new Date(), harumadiPdfId);
  const strict = replay || privacyReplayEnabled();
  if (strict) await deleteStoredHarumadiPdf(harumadiPdf.objectKey);
  await prisma.harumadiPdf.delete({ where: { id: harumadiPdf.id } });
  await commitPrivacyReplayReceipt(receipt);
  if (!strict) {
    try { await deleteStoredHarumadiPdf(harumadiPdf.objectKey); }
    catch { console.error("삭제한 하루마디 파일의 후속 정리가 필요합니다."); }
  }
  return true;
}
