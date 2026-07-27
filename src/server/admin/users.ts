import { deleteStoredJournalImage } from "@/server/journal/imageStorage";
import { prisma } from "@/server/db/prisma";

export async function forceDeleteUser(userId: string) {
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

  await prisma.$transaction([
    prisma.customerInquiry.updateMany({
      where: { requesterUserId: userId },
      data: {
        requesterUserId: null,
        requesterEmail: null,
      },
    }),
    prisma.user.delete({ where: { id: userId } }),
  ]);

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
