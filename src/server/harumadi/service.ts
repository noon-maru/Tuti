import { randomUUID } from "node:crypto";
import { recordContribution, recordLifecycle } from "@/server/analytics/lifecycle";
import { prisma } from "@/server/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { Harumadi, HarumadiSettings, HarumadiUpdate } from "@/shared/api/harumadi";
import { assertHarumadiPdfFreeform, assertSensitiveJournalReadable } from "@/server/journal/sensitivePolicy";
import { commitPrivacyReplayReceipt, preparePrivacyReplayReceipt } from "@/server/legal/privacyReplayLedger";
import { LEGACY_HARUMADI_BACK_COVER_TEXT, pickHarumadiBackCoverText } from "@/shared/harumadi/backCover";
import { harumadiTogetherEnabled, lockHarumadi, requireHarumadiAccess } from "./access";
import { HarumadiError } from "./errors";
export { HarumadiError } from "./errors";

const selection = {
  id: true, title: true, coverStyle: true, backCoverText: true, revision: true, createdAt: true, updatedAt: true,
  entries: { where: { entry: { sensitiveWithdrawnAt: null } }, select: { entryId: true } },
} as const;
type HarumadiRow = Prisma.HarumadiGetPayload<{ select: typeof selection }>;
const togetherSelection = { ...selection, ownerId: true, owner: { select: { displayName: true } }, collaborationStartedAt: true, members: { where: { endedAt: null }, select: { userId: true } } } as const;
type TogetherRow = Prisma.HarumadiGetPayload<{ select: typeof togetherSelection }>;
function togetherDto(row: TogetherRow, userId: string): Harumadi {
  return { ...dto(row), togetherEnabled: true, role: row.ownerId === userId ? "owner" : "contributor", shared: Boolean(row.collaborationStartedAt), ownerName: row.owner.displayName || "만든 사람", participantCount: row.members.length + 1 };
}
function dto(row: HarumadiRow): Harumadi {
  return { id: row.id, title: row.title, coverStyle: row.coverStyle as Harumadi["coverStyle"],
    backCoverText: row.backCoverText,
    revision: row.revision,
    entryIds: row.entries.map(link => link.entryId), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}
function validateFreeform(settings: HarumadiSettings) {
  assertHarumadiPdfFreeform({ ...settings, entryIds: [], letter: "", coverEntryId: null });
}
export async function listHarumadis(ownerId: string, cursorId: string | null) {
  if (harumadiTogetherEnabled()) return listTogetherLibrary(ownerId, cursorId);
  const cursor = cursorId ? await prisma.harumadi.findFirst({ where: { id: cursorId, ownerId }, select: { id: true, createdAt: true } }) : null;
  if (cursorId && !cursor) throw new HarumadiError("책장 위치를 다시 확인해주세요.");
  const rows = await prisma.harumadi.findMany({ where: { ownerId,
    ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}) },
    select: selection, take: 13, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  return { harumadis: rows.slice(0, 12).map(dto), nextCursor: rows.length > 12 ? rows[11].id : null,
    ...(!cursor ? { recordCount: await prisma.journalEntry.count({ where: { ownerId, sensitiveWithdrawnAt: null } }) } : {}) };
}
async function listTogetherLibrary(userId: string, cursorId: string | null) {
  return prisma.$transaction(async tx => {
    const cursor = cursorId ? await tx.harumadi.findFirst({ where: { id: cursorId, OR: [{ ownerId: userId }, { members: { some: { userId, endedAt: null } } }] }, select: { ownerId: true, createdAt: true, members: { where: { userId, endedAt: null }, select: { joinedAt: true } } } }) : null;
    if (cursorId && !cursor) throw new HarumadiError("책장 위치를 다시 확인해주세요.", 409);
    const at = cursor ? cursor.ownerId === userId ? cursor.createdAt : cursor.members[0]?.joinedAt : null;
    if (cursor && !at) throw new HarumadiError("참여 상태가 바뀌었어요. 책장을 다시 열어주세요.", 409);
    const [owned, memberships] = await Promise.all([
      tx.harumadi.findMany({ where: { ownerId: userId, ...(at ? { OR: [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: cursorId! } }] } : {}) }, select: togetherSelection, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 13 }),
      tx.harumadiMember.findMany({ where: { userId, endedAt: null, harumadi: { ownerId: { not: userId } }, ...(at ? { OR: [{ joinedAt: { lt: at } }, { joinedAt: at, harumadiId: { lt: cursorId! } }] } : {}) }, select: { joinedAt: true, harumadi: { select: togetherSelection } }, orderBy: [{ joinedAt: "desc" }, { harumadiId: "desc" }], take: 13 }),
    ]);
    const rows = [...owned.map(book => ({ book, at: book.createdAt })), ...memberships.map(member => ({ book: member.harumadi, at: member.joinedAt }))].sort((a, b) => b.at.getTime() - a.at.getTime() || b.book.id.localeCompare(a.book.id));
    return { harumadis: rows.slice(0, 12).map(row => togetherDto(row.book, userId)), nextCursor: rows.length > 12 ? rows[11].book.id : null,
      ...(!cursorId ? { recordCount: await tx.journalEntry.count({ where: { ownerId: userId, sensitiveWithdrawnAt: null } }) } : {}) };
  }, { isolationLevel: "RepeatableRead" });
}
export async function readHarumadi(ownerId: string, id: string) {
  if (harumadiTogetherEnabled()) return prisma.$transaction(async tx => {
    const book = await requireHarumadiAccess(tx, ownerId, id);
    const row = await tx.harumadi.findUniqueOrThrow({ where: { id }, select: selection });
    return { ...dto(row), togetherEnabled: true, shared: Boolean(book.collaborationStartedAt), role: book.ownerId === ownerId ? "owner" as const : "contributor" as const };
  });
  const row = await prisma.harumadi.findFirst({ where: { ownerId, id }, select: selection });
  if (!row) throw new HarumadiError("하루마디를 찾지 못했어요.", 404);
  return dto(row);
}
export async function createHarumadi(ownerId: string, settings: HarumadiSettings) {
  validateFreeform(settings);
  return prisma.$transaction(async tx => {
    // 첫 마디의 기본 하루마디 생성과 수동 생성을 같은 소유자 잠금으로 조정한다.
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${ownerId} FOR UPDATE`;
    const book = await tx.harumadi.create({ data: { id: randomUUID(), ownerId, title: settings.title,
      coverStyle: settings.coverStyle, backCoverText: settings.backCoverText ?? pickHarumadiBackCoverText() }, select: selection });
    await recordLifecycle(tx, ownerId, { name: "harumadi_created", key: `book:${book.id}`, entityId: book.id, bookId: book.id, origin: "manual" });
    return dto(book);
  });
}
export async function updateHarumadi(ownerId: string, id: string, input: HarumadiUpdate) {
  // 표지 변경에만 자유 입력 확인을 요구한다. 기록 선택 자체의 민감정보 동의는 원본 기록에 귀속된다.
  return prisma.$transaction(async tx => {
    if (harumadiTogetherEnabled()) {
      await lockHarumadi(tx, id);
      const access = await requireHarumadiAccess(tx, ownerId, id, true);
      if (access.collaborationStartedAt) {
        const links = await tx.harumadiEntryLink.findMany({ where: { harumadiId: id }, select: { entryId: true } });
        if (links.length !== input.entryIds.length || links.some(link => !input.entryIds.includes(link.entryId))) throw new HarumadiError("함께 채우는 마디는 추가·빼기 기능으로 변경해주세요.", 409);
        const previous = await tx.harumadi.findUniqueOrThrow({ where: { id }, select: { title: true, backCoverText: true } });
        if (previous.title !== input.title || (input.backCoverText !== undefined && previous.backCoverText !== input.backCoverText)) validateFreeform(input);
        const updated = await tx.harumadi.updateMany({ where: { id, ownerId, revision: input.revision }, data: { title: input.title, coverStyle: input.coverStyle, ...(input.backCoverText === undefined ? {} : { backCoverText: input.backCoverText }), revision: { increment: 1 } } });
        if (!updated.count) throw new HarumadiError("하루마디가 바뀌었어요. 다시 확인해주세요.", 409);
        return { ...dto(await tx.harumadi.findUniqueOrThrow({ where: { id }, select: selection })), shared: true, togetherEnabled: true, role: "owner" as const };
      }
    }
    const existing = await tx.harumadi.findFirst({ where: { id, ownerId }, select: { title: true, backCoverText: true, collaborationStartedAt: true } });
    if (!existing) throw new HarumadiError("하루마디를 찾지 못했어요.", 404);
    if (existing.collaborationStartedAt) throw new HarumadiError("함께 채우기 기능을 확인한 뒤 다시 수정해주세요.", 409);
    if (existing.title !== input.title || (input.backCoverText !== undefined &&
        input.backCoverText !== (existing.backCoverText ?? LEGACY_HARUMADI_BACK_COVER_TEXT))) validateFreeform(input);
    const updated = await tx.harumadi.updateMany({ where: { id, ownerId, revision: input.revision },
      data: { title: input.title, coverStyle: input.coverStyle,
        ...(input.backCoverText !== undefined ? { backCoverText: input.backCoverText } : {}), revision: { increment: 1 } } });
    if (!updated.count) throw new HarumadiError("다른 화면에서 하루마디가 바뀌었어요. 다시 불러온 후 수정해주세요.", 409);
    // 선택한 원본을 잠가 철회/삭제된 기록이나 다른 계정의 기록을 연결하지 않는다.
    if (input.entryIds.length) await tx.$queryRaw`SELECT id FROM journal_entries WHERE owner_id = ${ownerId} AND id = ANY(${input.entryIds}::text[]) ORDER BY id FOR UPDATE`;
    const entries = await tx.journalEntry.findMany({ where: { ownerId, id: { in: input.entryIds } },
      select: { id: true, sensitiveContent: true, sensitiveConsentVersion: true, sensitiveWithdrawnAt: true } });
    if (entries.length !== input.entryIds.length) throw new HarumadiError("선택한 마디가 없거나 삭제됐어요. 다시 골라주세요.", 409);
    entries.forEach(entry => assertSensitiveJournalReadable(entry));
    const priorLinks = await tx.harumadiEntryLink.findMany({ where: { harumadiId: id }, select: { entryId: true } });
    await tx.harumadiEntryLink.deleteMany({ where: { harumadiId: id, entryId: { notIn: input.entryIds } } });
    const added = input.entryIds.filter(entryId => !priorLinks.some(link => link.entryId === entryId)).map(entryId => ({ id: randomUUID(), harumadiId: id, entryId }));
    if (added.length) await tx.harumadiEntryLink.createMany({ data: added });
    for (const link of added) await recordContribution(tx, ownerId, id, link.entryId, link.id);
    return dto(await tx.harumadi.findFirstOrThrow({ where: { id, ownerId }, select: selection }));
  });
}
export async function deleteHarumadi(ownerId: string, id: string, replay = false) {
  if (!await prisma.harumadi.findFirst({ where: { id, ownerId }, select: { id: true } })) throw new HarumadiError("하루마디를 찾지 못했어요.", 404);
  // PDF와 마찬가지로 하루마디 삭제 원장에 남겨 백업 복원 후에도 다시 파기한다.
  const receipt = replay ? null : await preparePrivacyReplayReceipt("harumadi_deleted", ownerId, new Date(), id);
  const deleted = await prisma.harumadi.deleteMany({ where: { id, ownerId } });
  if (!deleted.count) throw new HarumadiError("하루마디를 찾지 못했어요.", 404);
  await commitPrivacyReplayReceipt(receipt);
}
