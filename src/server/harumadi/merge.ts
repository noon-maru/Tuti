import type { Prisma } from "@/generated/prisma/client";
export async function mergeTogether(tx: Prisma.TransactionClient, sourceId: string, targetId: string) {
  const memberships = await tx.harumadiMember.findMany({ where: { userId: sourceId }, include: { harumadi: { select: { ownerId: true } } } });
  for (const member of memberships) {
    if (member.harumadi.ownerId === targetId) { await tx.harumadiMember.delete({ where: { id: member.id } }); continue; }
    const existing = await tx.harumadiMember.findUnique({ where: { harumadiId_userId: { harumadiId: member.harumadiId, userId: targetId } } });
    if (existing) {
      // An ended destination membership must not silently regain access through a merge.
      if (existing.endedAt) await tx.harumadiEntryLink.deleteMany({ where: { harumadiId: member.harumadiId, entry: { ownerId: targetId } } });
      await tx.harumadiMember.delete({ where: { id: member.id } });
    } else await tx.harumadiMember.update({ where: { id: member.id }, data: { userId: targetId } });
    await tx.harumadi.update({ where: { id: member.harumadiId }, data: { accessRevision: { increment: 1 } } });
  }
  await tx.harumadiComment.updateMany({ where: { authorId: sourceId }, data: { authorId: targetId } });
  await tx.harumadiInvite.updateMany({ where: { acceptedByUserId: sourceId }, data: { acceptedByUserId: targetId } });
}
