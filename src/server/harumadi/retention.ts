import { prisma } from "@/server/db/prisma";

export const TOGETHER_HISTORY_RETENTION_DAYS = 30;
export async function purgeTogetherHistory(now = new Date(), apply = false) {
  const cutoff = new Date(now.getTime() - TOGETHER_HISTORY_RETENTION_DAYS * 86400_000);
  // A candidate ops image can run before the additive migration. Never assume installation.
  const installed = await prisma.$queryRaw<{ installed: boolean }[]>`SELECT to_regclass('public.harumadi_members') IS NOT NULL AS installed`;
  if (!installed[0]?.installed) return { mode: apply ? "apply" : "dry-run", installed: false, invites: 0, memberships: 0, comments: 0 };
  return prisma.$transaction(async tx => {
    const invites = { expiresAt: { lt: cutoff } };
    const memberships = { endedAt: { lt: cutoff } };
    const comments = { deletedAt: { lt: cutoff }, body: "", authorId: null, replies: { none: {} } };
    // Live comments, active members, original records and PDF snapshots are never candidates.
    const result = apply ? {
      invites: (await tx.harumadiInvite.deleteMany({ where: invites })).count,
      memberships: (await tx.harumadiMember.deleteMany({ where: memberships })).count,
      comments: (await tx.harumadiComment.deleteMany({ where: comments })).count,
    } : {
      invites: await tx.harumadiInvite.count({ where: invites }),
      memberships: await tx.harumadiMember.count({ where: memberships }),
      comments: await tx.harumadiComment.count({ where: comments }),
    };
    return { mode: apply ? "apply" : "dry-run", installed: true, cutoff: cutoff.toISOString(), ...result };
  });
}
