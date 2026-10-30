import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { commitPrivacyReplayReceipt, preparePrivacyReplayReceipt } from "@/server/legal/privacyReplayLedger";
import { lockHarumadi, requireHarumadiAccess, requireTogether } from "./access";
import { HarumadiError } from "./errors";

async function endPlan(tx: Prisma.TransactionClient, userId: string, id: string) {
  const book = await requireHarumadiAccess(tx, userId, id, true);
  const members = await tx.harumadiMember.findMany({ where: { harumadiId: id, endedAt: null }, select: { id: true, userId: true }, orderBy: { id: "asc" } });
  const invites = await tx.harumadiInvite.findMany({ where: { harumadiId: id, revokedAt: null }, select: { id: true }, orderBy: { id: "asc" } });
  const comments = await tx.harumadiComment.findMany({ where: { harumadiId: id, deletedAt: null }, select: { id: true }, orderBy: { id: "asc" } });
  const links = await tx.harumadiEntryLink.findMany({ where: { harumadiId: id, entry: { ownerId: { not: userId } } }, select: { id: true }, orderBy: { id: "asc" } });
  return { startedAt: book.collaborationStartedAt?.toISOString() ?? null, members, invites, comments, links };
}
const alreadyEnded = (plan: Awaited<ReturnType<typeof endPlan>>) => !plan.startedAt && !plan.members.length && !plan.invites.length && !plan.comments.length && !plan.links.length;

/** 원본 마디·확정된 PDF는 건드리지 않고 이 책의 공유만 종료한다. */
export async function endTogether(userId: string, id: string) {
  requireTogether();
  const plan = await prisma.$transaction(tx => endPlan(tx, userId, id), { isolationLevel: "RepeatableRead" });
  if (alreadyEnded(plan)) return { ended: true };

  // NAS 서명 파일 쓰기 중에는 DB 잠금을 잡지 않는다. 대상 세대는 마지막에 다시 대조한다.
  const finished = await preparePrivacyReplayReceipt("harumadi_together_ended", userId, new Date(), id);
  const receipts = [];
  for (const member of plan.members) receipts.push(await preparePrivacyReplayReceipt("harumadi_member_left", member.userId, new Date(), member.id));
  for (const invite of plan.invites) receipts.push(await preparePrivacyReplayReceipt("harumadi_invite_revoked", userId, new Date(), invite.id));
  for (const comment of plan.comments) receipts.push(await preparePrivacyReplayReceipt("harumadi_comment_deleted", userId, new Date(), comment.id));
  for (const link of plan.links) receipts.push(await preparePrivacyReplayReceipt("harumadi_entry_removed", userId, new Date(), link.id));

  const effectiveAt = await prisma.$transaction(async tx => {
    await lockHarumadi(tx, id);
    const current = await endPlan(tx, userId, id);
    // 다른 탭의 같은 종료가 먼저 끝났다면 준비 영수증도 확정하며 성공으로 응답한다.
    if (alreadyEnded(current)) return new Date();
    if (JSON.stringify(current) !== JSON.stringify(plan)) throw new HarumadiError("참여 상태가 바뀌었어요. 다시 확인한 뒤 종료해주세요.", 409);
    const now = new Date();
    await tx.harumadiEntryLink.deleteMany({ where: { harumadiId: id, entry: { ownerId: { not: userId } } } });
    await tx.harumadiComment.updateMany({ where: { harumadiId: id, deletedAt: null }, data: { body: "", authorId: null, deletedAt: now, revision: { increment: 1 } } });
    await tx.harumadiMember.updateMany({ where: { harumadiId: id, endedAt: null }, data: { endedAt: now } });
    await tx.harumadiInvite.updateMany({ where: { harumadiId: id, revokedAt: null }, data: { revokedAt: now } });
    await tx.harumadi.update({ where: { id }, data: { collaborationStartedAt: null, revision: { increment: 1 }, accessRevision: { increment: 1 } }, select: { id: true } });
    return now;
  });
  for (const receipt of receipts) await commitPrivacyReplayReceipt(receipt, effectiveAt);
  await commitPrivacyReplayReceipt(finished, effectiveAt);
  return { ended: true };
}
