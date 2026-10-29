import { prisma } from "@/server/db/prisma";
import { privacyReplayTarget, type TogetherReplayKind } from "@/server/legal/privacyReplayLedger";
import { endMember } from "./together";
import { lockHarumadi } from "./access";

// Generation-specific row IDs ensure an old withdrawal never removes a later rejoin/re-add.
export async function inspectTogetherReplay(record: { kind: TogetherReplayKind; target: string | null }, apply: boolean) {
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
