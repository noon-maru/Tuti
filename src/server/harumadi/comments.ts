import { randomUUID } from "node:crypto";
import { prisma } from "@/server/db/prisma";
import { consumeRateLimit } from "@/server/http/rateLimit";
import { commitPrivacyReplayReceipt, preparePrivacyReplayReceipt } from "@/server/legal/privacyReplayLedger";
import { parseTogetherComment, type HarumadiComment } from "@/shared/api/harumadiTogether";
import { lockHarumadi, requireHarumadiAccess, requireLinkedAccount, requireTogether } from "./access";
import { HarumadiError } from "./errors";

const selection = { id: true, authorId: true, parentId: true, body: true, revision: true, createdAt: true, updatedAt: true, deletedAt: true, author: { select: { displayName: true } } } as const;
export async function readComments(userId: string, id: string, parentId: string | null, cursor: string | null) {
  requireTogether();
  return prisma.$transaction(async tx => {
    const book = await requireHarumadiAccess(tx, userId, id);
    if (parentId && !await tx.harumadiComment.findFirst({ where: { id: parentId, harumadiId: id, parentId: null } })) throw new HarumadiError("댓글을 찾지 못했어요.", 404);
    const position = cursor ? await tx.harumadiComment.findFirst({ where: { id: cursor, harumadiId: id, parentId }, select: { id: true, createdAt: true } }) : null;
    if (cursor && !position) throw new HarumadiError("댓글 위치를 다시 확인해주세요.", 409);
    const rows = await tx.harumadiComment.findMany({ where: { harumadiId: id, parentId,
      ...(position ? { OR: [{ createdAt: { gt: position.createdAt } }, { createdAt: position.createdAt, id: { gt: position.id } }] } : {}) }, select: { ...selection, _count: { select: { replies: true } } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 21 });
    const comments = rows.slice(0, 20).map((row): HarumadiComment & { replyCount: number } => ({ id: row.id, authorId: row.deletedAt ? null : row.authorId, authorName: row.deletedAt ? "" : row.author?.displayName || "함께하는 사람", parentId: row.parentId, body: row.deletedAt ? "" : row.body, revision: row.revision,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), deleted: Boolean(row.deletedAt), canEdit: !row.deletedAt && row.authorId === userId, canDelete: !row.deletedAt && (row.authorId === userId || book.ownerId === userId), replyCount: row._count.replies }));
    return { comments, nextCursor: rows.length > 20 ? rows[19].id : null };
  }, { isolationLevel: "RepeatableRead" });
}
export async function saveComment(userId: string, id: string, value: unknown, commentId?: string, revision?: number) {
  requireTogether();
  const input = parseTogetherComment(value);
  if (!input) throw new HarumadiError("댓글은 1,000자 이내로 남겨주세요.");
  // Plain text only; no HTML, external previews or attachments. Initial abuse filter
  // is deliberately deterministic; reporting and operator review remain necessary.
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(input.body) || /(?:씨발|시발|좆|죽여버리)/.test(input.body)) throw new HarumadiError("서로를 존중하는 말로 남겨주세요.");
  if (!consumeRateLimit(userId, { id: "harumadi-comments", limit: 20, windowMs: 60_000 }).allowed) throw new HarumadiError("댓글을 너무 빠르게 남기고 있어요. 잠시 후 다시 시도해주세요.", 429);
  return prisma.$transaction(async tx => {
    await lockHarumadi(tx, id); const book = await requireHarumadiAccess(tx, userId, id);
    await requireLinkedAccount(tx, userId);
    if (!book.collaborationStartedAt) throw new HarumadiError("함께 채우는 하루마디에서 이야기를 나눌 수 있어요.", 409);
    if (input.parentId) {
      const parent = await tx.harumadiComment.findFirst({ where: { id: input.parentId, harumadiId: id, parentId: null, ...(commentId ? {} : { deletedAt: null }) } });
      if (!parent) throw new HarumadiError("답글을 남길 댓글을 찾지 못했어요.", 404);
    }
    if (commentId) {
      if (!Number.isSafeInteger(revision)) throw new HarumadiError("댓글을 다시 확인해주세요.");
      const result = await tx.harumadiComment.updateMany({ where: { id: commentId, harumadiId: id, authorId: userId, deletedAt: null, revision, parentId: input.parentId }, data: { body: input.body, revision: { increment: 1 } } });
      if (!result.count) throw new HarumadiError("댓글이 바뀌었거나 삭제됐어요. 다시 확인해주세요.", 409);
      return { id: commentId };
    }
    const requestId = (value as Record<string, unknown>).requestId;
    const newId = typeof requestId === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(requestId) ? requestId : randomUUID();
    const existing = await tx.harumadiComment.findUnique({ where: { id: newId } });
    if (existing) {
      if (existing.harumadiId !== id || existing.authorId !== userId || existing.body !== input.body || existing.parentId !== input.parentId || existing.deletedAt) throw new HarumadiError("댓글 요청을 다시 확인해주세요.", 409);
      return { id: existing.id };
    }
    return tx.harumadiComment.create({ data: { id: newId, harumadiId: id, authorId: userId, ...input }, select: { id: true } });
  });
}
export async function eraseComment(userId: string, id: string, commentId: string, admin = false) {
  if (!admin) requireTogether();
  const exists = await prisma.$transaction(async tx => {
    const book = admin ? null : await requireHarumadiAccess(tx, userId, id);
    const comment = await tx.harumadiComment.findFirst({ where: { id: commentId, harumadiId: id } });
    if (!comment || (!admin && book?.ownerId !== userId && comment.authorId !== userId)) throw new HarumadiError("댓글을 삭제할 수 없어요.", 404);
    return comment;
  });
  if (exists.deletedAt) return;
  const receipt = await preparePrivacyReplayReceipt("harumadi_comment_deleted", userId, new Date(), commentId);
  await prisma.$transaction(async tx => {
    await lockHarumadi(tx, id);
    const book = admin ? null : await requireHarumadiAccess(tx, userId, id);
    const current = await tx.harumadiComment.findFirst({ where: { id: commentId, harumadiId: id } });
    if (!current || (!admin && book?.ownerId !== userId && current.authorId !== userId)) throw new HarumadiError("댓글 상태가 바뀌었어요.", 409);
    await tx.harumadiComment.update({ where: { id: commentId }, data: { body: "", authorId: null, deletedAt: new Date(), revision: { increment: 1 } } });
  });
  await commitPrivacyReplayReceipt(receipt);
}
