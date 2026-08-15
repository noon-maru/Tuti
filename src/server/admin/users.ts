import { deleteStoredJournalImage } from "@/server/journal/imageStorage";
import { prisma } from "@/server/db/prisma";
import type { LocationSecurityAuditData } from "@/server/location/securityAudit";

export async function forceDeleteUser(
  userId: string,
  permissionAudit?: LocationSecurityAuditData,
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      journalEntries: {
        select: {
          image: true,
        },
      },
    },
  });

  if (!user) return null;

  await prisma.$transaction(async (transaction) => {
    await transaction.customerInquiry.updateMany({
      where: { requesterUserId: userId },
      data: {
        requesterUserId: null,
        requesterEmail: null,
      },
    });
    await transaction.user.delete({ where: { id: userId } });
    if (permissionAudit) {
      await transaction.locationSecurityAuditEvent.create({
        data: permissionAudit,
      });
    }
  });

  const failedImageDeletions: string[] = [];

  for (const entry of user.journalEntries) {
    try {
      await deleteStoredJournalImage(entry.image);
    } catch {
      if (entry.image) failedImageDeletions.push(entry.image);
    }
  }

  return {
    id: user.id,
    role: user.role,
    deletedJournalCount: user.journalEntries.length,
    failedImageDeletionCount: failedImageDeletions.length,
  };
}
