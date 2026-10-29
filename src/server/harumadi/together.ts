import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { commitPrivacyReplayReceipt, preparePrivacyReplayReceipt } from "@/server/legal/privacyReplayLedger";
import { INVITE_TOKEN, type HarumadiTogether } from "@/shared/api/harumadiTogether";
import { assertSensitiveJournalReadable } from "@/server/journal/sensitivePolicy";
import { lockHarumadi, lockSharingSecurity, requireHarumadiAccess, requireLinkedAccount, requireTogether } from "./access";
import { HarumadiError } from "./errors";

export function hashInvite(token: string) {
  if (!INVITE_TOKEN.test(token)) throw new HarumadiError("초대 링크를 다시 확인해주세요.", 404);
  return createHash("sha256").update(token).digest("hex");
}
const inviteSelect = { id: true, expiresAt: true, acceptedAt: true, revokedAt: true } as const;
export async function readTogether(userId: string, id: string): Promise<HarumadiTogether> {
  requireTogether();
  return prisma.$transaction(async tx => {
    const book = await requireHarumadiAccess(tx, userId, id);
    const owner = await tx.user.findUniqueOrThrow({ where: { id: book.ownerId }, select: { displayName: true } });
    const members = await tx.harumadiMember.findMany({ where: { harumadiId: id, endedAt: null }, select: { userId: true, user: { select: { displayName: true } } }, orderBy: { joinedAt: "asc" } });
    const invites = book.ownerId === userId ? await tx.harumadiInvite.findMany({ where: { harumadiId: id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, select: inviteSelect, orderBy: { createdAt: "desc" }, take: 50 }) : [];
    return { owner: book.ownerId === userId, participants: [{ userId: book.ownerId, name: owner.displayName || "만든 사람", owner: true },
      ...members.map(member => ({ userId: member.userId, name: member.user.displayName || "함께하는 사람", owner: false }))],
      invites: invites.map(invite => ({ id: invite.id, expiresAt: invite.expiresAt.toISOString(), acceptedAt: invite.acceptedAt?.toISOString() ?? null, revokedAt: invite.revokedAt?.toISOString() ?? null })) };
  }, { isolationLevel: "RepeatableRead" });
}
export async function createInvite(userId: string, id: string) {
  requireTogether();
  const token = randomBytes(32).toString("base64url");
  const invite = await prisma.$transaction(async tx => {
    await lockHarumadi(tx, id);
    await requireHarumadiAccess(tx, userId, id, true);
    await requireLinkedAccount(tx, userId);
    if (await tx.journalEntry.count({ where: { harumadiEntries: { some: { harumadiId: id } }, OR: [{ sensitiveContent: null }, { sensitiveContent: true }, { sensitiveWithdrawnAt: { not: null } }] } })) throw new HarumadiError("민감정보가 있거나 확인되지 않은 마디를 먼저 빼주세요.", 409);
    // Limit outstanding links, not participants. Tokens are returned only once, never stored raw.
    if (await tx.harumadiInvite.count({ where: { harumadiId: id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } }) >= 50) throw new HarumadiError("사용하지 않은 초대를 취소한 뒤 다시 보내주세요.", 429);
    await tx.harumadi.update({ where: { id }, data: { collaborationStartedAt: new Date(), accessRevision: { increment: 1 } } });
    return tx.harumadiInvite.create({ data: { id: randomUUID(), harumadiId: id, tokenHash: hashInvite(token), expiresAt: new Date(Date.now() + 7 * 86400_000) }, select: inviteSelect });
  });
  return { token, id: invite.id, expiresAt: invite.expiresAt.toISOString() };
}
export async function acceptInvite(userId: string, token: string) {
  requireTogether();
  const tokenHash = hashInvite(token);
  const hint = await prisma.harumadiInvite.findUnique({ where: { tokenHash }, select: { harumadiId: true } });
  if (!hint) throw new HarumadiError("사용할 수 없는 초대예요. 새 초대를 부탁해주세요.", 410);
  return prisma.$transaction(async tx => {
    await lockSharingSecurity(tx);
    await lockHarumadi(tx, hint.harumadiId);
    await requireLinkedAccount(tx, userId);
    const invite = await tx.harumadiInvite.findUnique({ where: { tokenHash }, include: { harumadi: { select: { ownerId: true } } } });
    if (!invite || invite.revokedAt || invite.expiresAt <= new Date() || (invite.acceptedAt && invite.acceptedByUserId !== userId)) throw new HarumadiError("만료되었거나 이미 사용한 초대예요. 새 초대를 부탁해주세요.", 410);
    const existing = await tx.harumadiMember.findUnique({ where: { harumadiId_userId: { harumadiId: invite.harumadiId, userId } } });
    if (invite.acceptedAt && existing?.endedAt) throw new HarumadiError("새 초대로 다시 참여해주세요.", 410);
    if (existing?.endedAt && invite.createdAt <= existing.endedAt) throw new HarumadiError("참여가 종료되기 전에 만든 초대예요. 새 초대를 부탁해주세요.", 410);
    if (invite.harumadi.ownerId === userId) throw new HarumadiError("직접 만든 하루마디예요. 상대방에게 초대를 보내주세요.");
    if (existing && !existing.endedAt) return { harumadiId: invite.harumadiId };
    const participants = await tx.harumadiMember.findMany({ where: { harumadiId: invite.harumadiId, endedAt: null }, select: { userId: true } });
    const ids = [invite.harumadi.ownerId, ...participants.map(member => member.userId)];
    if (await tx.journalAuthorBlock.findFirst({ where: { OR: [{ blockerUserId: userId, blockedUserId: { in: ids } }, { blockedUserId: userId, blockerUserId: { in: ids } }] } })) throw new HarumadiError("차단 관계가 있는 사람과 함께 채울 수 없어요.", 403);
    if (!existing || existing.endedAt) await tx.harumadiMember.upsert({ where: { harumadiId_userId: { harumadiId: invite.harumadiId, userId } },
      create: { id: randomUUID(), harumadiId: invite.harumadiId, userId }, update: { id: randomUUID(), joinedAt: new Date(), endedAt: null } });
    await tx.harumadiInvite.update({ where: { id: invite.id }, data: { acceptedAt: invite.acceptedAt ?? new Date(), acceptedByUserId: userId } });
    await tx.harumadi.update({ where: { id: invite.harumadiId }, data: { accessRevision: { increment: 1 } } });
    return { harumadiId: invite.harumadiId };
  });
}
export async function inspectInvite(userId: string, token: string) {
  requireTogether();
  return prisma.$transaction(async tx => {
    await requireLinkedAccount(tx, userId);
    const invite = await tx.harumadiInvite.findUnique({ where: { tokenHash: hashInvite(token) }, include: { harumadi: { select: { id: true, ownerId: true, title: true, owner: { select: { displayName: true } } } } } });
    if (!invite) throw new HarumadiError("초대를 찾지 못했어요. 링크를 다시 확인해주세요.", 410);
    const member = await tx.harumadiMember.findUnique({ where: { harumadiId_userId: { harumadiId: invite.harumadiId, userId } } });
    const joined = invite.harumadi.ownerId === userId || Boolean(member && !member.endedAt);
    if (!joined && (invite.revokedAt || invite.expiresAt <= new Date() || invite.acceptedAt || (member?.endedAt && invite.createdAt <= member.endedAt))) throw new HarumadiError("사용할 수 없는 초대예요. 새 초대를 부탁해주세요.", 410);
    return { harumadiId: invite.harumadi.id, title: invite.harumadi.title, inviterName: invite.harumadi.owner.displayName || "함께할 사람", joined };
  });
}
export async function revokeInvite(userId: string, id: string, inviteId: string) {
  requireTogether();
  await prisma.$transaction(async tx => {
    await requireHarumadiAccess(tx, userId, id, true);
    if (!await tx.harumadiInvite.findFirst({ where: { id: inviteId, harumadiId: id } })) throw new HarumadiError("초대를 찾지 못했어요.", 404);
  });
  const receipt = await preparePrivacyReplayReceipt("harumadi_invite_revoked", userId, new Date(), inviteId);
  await prisma.$transaction(async tx => {
    await lockHarumadi(tx, id); await requireHarumadiAccess(tx, userId, id, true);
    if (!await tx.harumadiInvite.findFirst({ where: { id: inviteId, harumadiId: id } })) throw new HarumadiError("초대를 찾지 못했어요.", 404);
    await tx.harumadiInvite.update({ where: { id: inviteId }, data: { revokedAt: new Date() } });
  });
  await commitPrivacyReplayReceipt(receipt);
}
export async function endMember(tx: Prisma.TransactionClient, id: string, userId: string) {
  await tx.harumadiEntryLink.deleteMany({ where: { harumadiId: id, entry: { ownerId: userId } } });
  await tx.harumadiComment.updateMany({ where: { harumadiId: id, authorId: userId }, data: { body: "", authorId: null, deletedAt: new Date(), revision: { increment: 1 } } });
  await tx.harumadiMember.updateMany({ where: { harumadiId: id, userId, endedAt: null }, data: { endedAt: new Date() } });
  await tx.harumadi.update({ where: { id }, data: { revision: { increment: 1 }, accessRevision: { increment: 1 } } });
}
export async function leaveHarumadi(actorId: string, id: string, targetId: string) {
  requireTogether();
  const member = await prisma.$transaction(async tx => {
    const book = await requireHarumadiAccess(tx, actorId, id, actorId !== targetId);
    if (book.ownerId === targetId) throw new HarumadiError("만든 사람은 나가기 대신 하루마디 틀을 삭제할 수 있어요.");
    return tx.harumadiMember.findUnique({ where: { harumadiId_userId: { harumadiId: id, userId: targetId } } });
  });
  if (!member) throw new HarumadiError("참여자를 찾지 못했어요.", 404);
  const receipt = await preparePrivacyReplayReceipt("harumadi_member_left", targetId, new Date(), member.id);
  await prisma.$transaction(async tx => {
    await lockHarumadi(tx, id); await requireHarumadiAccess(tx, actorId, id, actorId !== targetId);
    const current = await tx.harumadiMember.findUnique({ where: { id: member.id } });
    if (!current) throw new HarumadiError("참여 상태가 바뀌었어요. 다시 확인해주세요.", 409);
    if (!current.endedAt) await endMember(tx, id, targetId);
  });
  await commitPrivacyReplayReceipt(receipt);
}

// Granular writes preserve concurrent additions; only the author's own records can be added.
export async function addSharedEntry(userId: string, id: string, entryId: string) {
  requireTogether();
  await prisma.$transaction(async tx => {
    await lockHarumadi(tx, id); const book = await requireHarumadiAccess(tx, userId, id);
    await tx.$queryRaw`SELECT id FROM journal_entries WHERE id = ${entryId} AND owner_id = ${userId} FOR UPDATE`;
    const entry = await tx.journalEntry.findFirst({ where: { id: entryId, ownerId: userId } });
    if (!entry) throw new HarumadiError("내가 남긴 마디만 담을 수 있어요.", 404);
    assertSensitiveJournalReadable(entry);
    if (await tx.contentReport.findFirst({ where: { harumadiId: id, entryId, sharedHiddenAt: { not: null } }, select: { id: true } })) throw new HarumadiError("운영 검토로 이 책에서 제외된 마디예요.", 403);
    if (book.collaborationStartedAt && entry.sensitiveContent !== false) throw new HarumadiError("민감정보가 없는 마디만 함께 채울 수 있어요.", 409);
    const exists = await tx.harumadiEntryLink.findUnique({ where: { harumadiId_entryId: { harumadiId: id, entryId } } });
    if (!exists) {
      await tx.harumadiEntryLink.create({ data: { harumadiId: id, entryId } });
      await tx.harumadi.update({ where: { id }, data: { revision: { increment: 1 } } });
    }
  });
}
export async function removeSharedEntry(userId: string, id: string, entryId: string) {
  requireTogether();
  const link = await prisma.$transaction(async tx => {
    const book = await requireHarumadiAccess(tx, userId, id);
    const value = await tx.harumadiEntryLink.findUnique({ where: { harumadiId_entryId: { harumadiId: id, entryId } }, include: { entry: { select: { ownerId: true } } } });
    if (!value || (book.ownerId !== userId && value.entry.ownerId !== userId)) throw new HarumadiError("이 마디를 뺄 수 없어요.", 404);
    return value;
  });
  const receipt = await preparePrivacyReplayReceipt("harumadi_entry_removed", userId, new Date(), link.id);
  await prisma.$transaction(async tx => {
    await lockHarumadi(tx, id); const book = await requireHarumadiAccess(tx, userId, id);
    const current = await tx.harumadiEntryLink.findUnique({ where: { id: link.id }, include: { entry: { select: { ownerId: true } } } });
    if (current && book.ownerId !== userId && current.entry.ownerId !== userId) throw new HarumadiError("마디의 작성자가 바뀌었어요.", 409);
    await tx.harumadiEntryLink.deleteMany({ where: { id: link.id } });
    await tx.harumadi.update({ where: { id }, data: { revision: { increment: 1 } } });
  });
  await commitPrivacyReplayReceipt(receipt);
}
