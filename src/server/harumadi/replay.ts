import { prisma } from "@/server/db/prisma";
import { privacyReplaySubject, privacyReplayTarget, type TogetherReplayKind } from "@/server/legal/privacyReplayLedger";
import { endMember } from "./together";
import { lockHarumadi } from "./access";

// Generation-specific row IDs ensure an old withdrawal never removes a later rejoin/re-add.
export async function inspectTogetherReplay(record: { kind: TogetherReplayKind; target: string | null; subject: string; effectiveAt: string | null }, apply: boolean) {
  if (record.kind === "harumadi_together_ended") {
    let cursor: string | undefined, matched = 0, fulfilled = true;
    do {
      const books = await prisma.harumadi.findMany({ where: cursor ? { id: { gt: cursor } } : {}, select: { id: true, ownerId: true, collaborationStartedAt: true }, orderBy: { id: "asc" }, take: 250 });
      for (const book of books) {
        if (privacyReplayTarget("harumadi", book.id) !== record.target) continue;
        matched++;
        if (privacyReplaySubject(book.ownerId) !== record.subject) { fulfilled = false; continue; }
        if (!book.collaborationStartedAt) continue;
        const cutoff = record.effectiveAt ? new Date(record.effectiveAt) : null;
        // 새 초대로 다시 시작한 공동작성은 과거 종료 요청으로 되돌리지 않는다.
        if (cutoff && book.collaborationStartedAt > cutoff) continue;
        if (apply && cutoff && book.collaborationStartedAt < cutoff) {
          await prisma.harumadi.updateMany({ where: { id: book.id, ownerId: book.ownerId, collaborationStartedAt: { lt: cutoff } }, data: { collaborationStartedAt: null, revision: { increment: 1 }, accessRevision: { increment: 1 } } });
        } else fulfilled = false;
      }
      cursor = books.length === 250 ? books.at(-1)!.id : undefined;
    } while (cursor);
    return { fulfilled, matched };
  }
  if (record.kind === "harumadi_user_blocked" || record.kind === "harumadi_user_unblocked") {
    let after: string | undefined, actorId: string | undefined, targetId: string | undefined;
    do {
      const users = await prisma.user.findMany({ where: after ? { id: { gt: after } } : {}, select: { id: true }, orderBy: { id: "asc" }, take: 250 });
      for (const user of users) {
        if (privacyReplaySubject(user.id) === record.subject) actorId = user.id;
        if (privacyReplayTarget("harumadi", user.id) === record.target) targetId = user.id;
      }
      after = users.length === 250 ? users.at(-1)!.id : undefined;
    } while (after);
    if (!actorId || !targetId) return { fulfilled: true, matched: 0 };
    const pair = { blockerUserId: actorId, blockedUserId: targetId };
    const existing = await prisma.journalAuthorBlock.findUnique({ where: { blockerUserId_blockedUserId: pair } });
    const blocked = record.kind === "harumadi_user_blocked";
    if (apply && record.effectiveAt && (!existing || existing.createdAt <= new Date(record.effectiveAt))) {
      if (blocked) await prisma.journalAuthorBlock.upsert({ where: { blockerUserId_blockedUserId: pair }, create: { ...pair, createdAt: new Date(record.effectiveAt) }, update: {} });
      else await prisma.journalAuthorBlock.deleteMany({ where: pair });
    }
    return { fulfilled: blocked ? Boolean(existing) : !existing, matched: 1 };
  }
  const ids: { id: string; harumadiId: string; ended?: boolean }[] = [];
  let cursor: string | undefined;
  do {
    const where = cursor ? { id: { gt: cursor } } : {};
    const options = { where, orderBy: { id: "asc" as const }, take: 250 };
    const rows = record.kind === "harumadi_member_left"
      ? (await prisma.harumadiMember.findMany(options)).map(row => ({ ...row, ended: Boolean(row.endedAt) }))
      : record.kind === "harumadi_invite_revoked"
        ? (await prisma.harumadiInvite.findMany(options)).map(row => ({ ...row, ended: Boolean(row.revokedAt) }))
        : record.kind === "harumadi_comment_deleted"
          ? (await prisma.harumadiComment.findMany(options)).map(row => ({ ...row, ended: Boolean(row.deletedAt && !row.body && !row.authorId) }))
          : (await prisma.harumadiEntryLink.findMany(options)).map(row => ({ ...row, ended: false }));
    for (const row of rows) if (privacyReplayTarget("harumadi", row.id) === record.target) ids.push(row);
    cursor = rows.length === 250 ? rows.at(-1)!.id : undefined;
  } while (cursor);
  if (apply) for (const row of ids) await prisma.$transaction(async tx => {
    await lockHarumadi(tx, row.harumadiId);
    if (record.kind === "harumadi_member_left") {
      const member = await tx.harumadiMember.findUnique({ where: { id: row.id } });
      if (member && !member.endedAt) await endMember(tx, member.harumadiId, member.userId);
    } else if (record.kind === "harumadi_invite_revoked") {
      await tx.harumadiInvite.updateMany({ where: { id: row.id }, data: { revokedAt: new Date() } });
    } else if (record.kind === "harumadi_comment_deleted") {
      await tx.harumadiComment.updateMany({ where: { id: row.id }, data: { body: "", authorId: null, deletedAt: new Date(), revision: { increment: 1 } } });
    } else {
      await tx.harumadiEntryLink.deleteMany({ where: { id: row.id } });
      await tx.harumadi.updateMany({ where: { id: row.harumadiId }, data: { revision: { increment: 1 }, accessRevision: { increment: 1 } } });
    }
  });
  return { fulfilled: !ids.length || ids.every(row => row.ended), matched: ids.length };
}
