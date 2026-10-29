import { randomUUID } from "node:crypto";
import { prisma } from "@/server/db/prisma";
import { commitPrivacyReplayReceipt, preparePrivacyReplayReceipt } from "@/server/legal/privacyReplayLedger";
import { lockHarumadi, lockSharingSecurity, requireHarumadiAccess, requireTogether } from "./access";
import { HarumadiError } from "./errors";
import { endMember } from "./together";
import { eraseComment } from "./comments";

export async function reportSharedTarget(userId: string, id: string, value: Record<string, unknown>) {
  requireTogether();
  if (typeof value.target !== "string" || !["entry", "comment", "user"].includes(String(value.kind)) || !["inappropriate", "copyright", "privacy", "spam", "other"].includes(String(value.reason))) throw new HarumadiError("신고 대상을 확인해주세요.");
  return prisma.$transaction(async tx => {
    const book = await requireHarumadiAccess(tx, userId, id);
    const entry = value.kind === "entry" ? await tx.journalEntry.findFirst({ where: { id: value.target as string, harumadiEntries: { some: { harumadiId: id } } }, select: { ownerId: true } }) : null;
    const comment = value.kind === "comment" ? await tx.harumadiComment.findFirst({ where: { id: value.target as string, harumadiId: id, deletedAt: null }, select: { authorId: true, body: true } }) : null;
    const participant = value.kind === "user" && (book.ownerId === value.target || await tx.harumadiMember.findFirst({ where: { harumadiId: id, userId: value.target as string, endedAt: null } }));
    const targetOwnerId = entry?.ownerId ?? comment?.authorId ?? (participant ? value.target as string : null);
    if (!targetOwnerId || targetOwnerId === userId) throw new HarumadiError("신고할 대상을 찾지 못했어요.", 404);
    const entryId = entry ? value.target as string : null, commentId = comment ? value.target as string : null;
    const existing = await tx.contentReport.findFirst({ where: { reporterUserId: userId, harumadiId: id, targetOwnerId, entryId, commentId, status: { in: ["pending", "reviewing"] } }, select: { id: true } });
    if (existing) return existing;
    return tx.contentReport.create({ data: { id: randomUUID(), reporterUserId: userId, harumadiId: id, entryId, commentId, targetOwnerId,
      targetTitle: `함께 채우기 ${value.kind === "comment" ? "댓글" : value.kind === "entry" ? "마디" : "사용자"} 신고`, reason: value.reason as "inappropriate" | "copyright" | "privacy" | "spam" | "other",
      // Minimum reported-comment evidence only; never copy the book or other participants' entries.
      detail: [typeof value.detail === "string" ? value.detail.slice(0, 500) : "", comment ? `신고한 댓글: ${comment.body}` : ""].filter(Boolean).join("\n").slice(0, 1500) }, select: { id: true } });
  });
}
export async function hideReportedSharedTarget(reportId: string, adminId: string) {
  const report = await prisma.contentReport.findUnique({ where: { id: reportId } });
  if (!report?.harumadiId) throw new HarumadiError("공유 신고를 찾지 못했어요.", 404);
  if (report.commentId) await eraseComment(adminId, report.harumadiId, report.commentId, true);
  else if (report.entryId) {
    const link = await prisma.harumadiEntryLink.findUnique({ where: { harumadiId_entryId: { harumadiId: report.harumadiId, entryId: report.entryId } } });
    if (link) {
      const receipt = await preparePrivacyReplayReceipt("harumadi_entry_removed", adminId, new Date(), link.id);
      await prisma.$transaction(async tx => {
        await lockHarumadi(tx, report.harumadiId!);
        await tx.harumadiEntryLink.deleteMany({ where: { id: link.id } });
        await tx.harumadi.updateMany({ where: { id: report.harumadiId! }, data: { revision: { increment: 1 }, accessRevision: { increment: 1 } } });
      });
      await commitPrivacyReplayReceipt(receipt);
    }
  } else throw new HarumadiError("사용자 신고는 계정 점검과 참여자 관리로 처리해주세요.", 409);
  await prisma.contentReport.update({ where: { id: reportId }, data: { sharedHiddenAt: new Date(), status: "resolved", reviewedAt: new Date(), reviewerUserId: adminId, resolutionNote: "공유 대상 제거. 원본 마디·기존 PDF·타인의 답글은 보존." } });
}

export async function blockTogetherUser(userId: string, id: string, targetId: string) {
  requireTogether();
  if (userId === targetId) throw new HarumadiError("본인은 차단할 수 없어요.");
  const snapshot = await prisma.$transaction(async tx => {
    const book = await requireHarumadiAccess(tx, userId, id);
    if (book.ownerId !== targetId && !await tx.harumadiMember.findFirst({ where: { harumadiId: id, userId: targetId, endedAt: null } })) throw new HarumadiError("함께 채우는 사람을 확인해주세요.", 404);
    return tx.harumadi.findMany({ where: { AND: [
      { OR: [{ ownerId: userId }, { members: { some: { userId, endedAt: null } } }] },
      { OR: [{ ownerId: targetId }, { members: { some: { userId: targetId, endedAt: null } } }] },
    ] }, select: { id: true, ownerId: true, members: { where: { endedAt: null, userId: { in: [userId, targetId] } }, select: { id: true, userId: true } } }, orderBy: { id: "asc" } });
  });
  const blockReceipt = await preparePrivacyReplayReceipt("harumadi_user_blocked", userId, new Date(), targetId);
  const receipts = [];
  for (const book of snapshot) {
    const subject = book.ownerId === userId ? targetId : userId;
    const member = book.members.find(item => item.userId === subject);
    if (member) receipts.push(await preparePrivacyReplayReceipt("harumadi_member_left", subject, new Date(), member.id));
  }
  await prisma.$transaction(async tx => {
    await lockSharingSecurity(tx);
    await requireHarumadiAccess(tx, userId, id);
    const common = await tx.harumadi.findMany({ where: { AND: [
      { OR: [{ ownerId: userId }, { members: { some: { userId, endedAt: null } } }] },
      { OR: [{ ownerId: targetId }, { members: { some: { userId: targetId, endedAt: null } } }] },
    ] }, select: { id: true, members: { where: { endedAt: null, userId: { in: [userId, targetId] } }, select: { id: true } } } });
    if (common.some(book => !snapshot.some(old => old.id === book.id && book.members.every(member => old.members.some(previous => previous.id === member.id))))) throw new HarumadiError("참여 상태가 바뀌었어요. 차단을 다시 시도해주세요.", 409);
    await tx.journalAuthorBlock.upsert({ where: { blockerUserId_blockedUserId: { blockerUserId: userId, blockedUserId: targetId } }, create: { blockerUserId: userId, blockedUserId: targetId }, update: {} });
    for (const book of snapshot) {
      await lockHarumadi(tx, book.id);
      const subject = book.ownerId === userId ? targetId : userId;
      const previous = book.members.find(member => member.userId === subject);
      const current = previous ? await tx.harumadiMember.findUnique({ where: { id: previous.id } }) : null;
      if (current && !current.endedAt) await endMember(tx, book.id, subject);
    }
  });
  await commitPrivacyReplayReceipt(blockReceipt);
  for (const receipt of receipts) await commitPrivacyReplayReceipt(receipt);
}
export async function unblockTogetherUser(userId: string, targetId: string) {
  const receipt = await preparePrivacyReplayReceipt("harumadi_user_unblocked", userId, new Date(), targetId);
  const result = await prisma.$transaction(async tx => {
    await lockSharingSecurity(tx);
    return tx.journalAuthorBlock.deleteMany({ where: { blockerUserId: userId, blockedUserId: targetId } });
  });
  await commitPrivacyReplayReceipt(receipt);
  return result;
}
