import { prisma } from "@/server/db/prisma";
import { preparePrivacyReplayReceipt } from "@/server/legal/privacyReplayLedger";
import { enqueueDataCleanup, processDataCleanupJob } from "@/server/legal/dataCleanup";

export async function deleteHarumadiPdf(ownerId: string, harumadiPdfId: string, replay = false) {
  const harumadiPdf = await prisma.harumadiPdf.findFirst({ where: { id: harumadiPdfId, ownerId }, select: { id: true, objectKey: true } });
  if (!harumadiPdf) return false;
  const receipt = replay ? null : await preparePrivacyReplayReceipt("harumadi_deleted", ownerId, new Date(), harumadiPdfId);
  const result = await prisma.$transaction(async tx => {
    const deleted = await tx.harumadiPdf.deleteMany({ where: { id: harumadiPdf.id, ownerId } });
    if (!deleted.count) return null;
    return { cleanupJobId: await enqueueDataCleanup(tx, { images: [], pdfs: [harumadiPdf.objectKey], appleTokens: [], receipt }) };
  });
  if (!result) return false;
  if (result.cleanupJobId) await processDataCleanupJob(result.cleanupJobId).catch(() => false);
  return true;
}
