import { randomUUID } from "node:crypto";
import { prisma } from "@/server/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { JournalNotebook, NotebookSettings, NotebookUpdate } from "@/shared/api/journalNotebook";
import { assertJournalBookFreeform, assertSensitiveJournalReadable } from "./sensitivePolicy";
import { commitPrivacyReplayReceipt, preparePrivacyReplayReceipt } from "@/server/legal/privacyReplayLedger";

export class NotebookError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
const selection = {
  id: true, title: true, coverStyle: true, innerStyle: true, revision: true, createdAt: true, updatedAt: true,
  entries: { where: { entry: { sensitiveWithdrawnAt: null } }, select: { entryId: true } },
} as const;
type NotebookRow = Prisma.JournalNotebookGetPayload<{ select: typeof selection }>;
function dto(row: NotebookRow): JournalNotebook {
  return { id: row.id, title: row.title, coverStyle: row.coverStyle as JournalNotebook["coverStyle"],
    innerStyle: row.innerStyle as JournalNotebook["innerStyle"], revision: row.revision,
    entryIds: row.entries.map(link => link.entryId), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}
function validateFreeform(settings: NotebookSettings) {
  assertJournalBookFreeform({ ...settings, entryIds: [], letter: "", coverEntryId: null });
}
export async function listNotebooks(ownerId: string, cursorId: string | null) {
  const cursor = cursorId ? await prisma.journalNotebook.findFirst({ where: { id: cursorId, ownerId }, select: { id: true, createdAt: true } }) : null;
  if (cursorId && !cursor) throw new NotebookError("책장 위치를 다시 확인해주세요.");
  const rows = await prisma.journalNotebook.findMany({ where: { ownerId,
    ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}) },
    select: selection, take: 13, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  return { notebooks: rows.slice(0, 12).map(dto), nextCursor: rows.length > 12 ? rows[11].id : null,
    ...(!cursor ? { recordCount: await prisma.journalEntry.count({ where: { ownerId, sensitiveWithdrawnAt: null } }) } : {}) };
}
export async function readNotebook(ownerId: string, id: string) {
  const row = await prisma.journalNotebook.findFirst({ where: { ownerId, id }, select: selection });
  if (!row) throw new NotebookError("기록집을 찾지 못했어요.", 404);
  return dto(row);
}
export async function createNotebook(ownerId: string, settings: NotebookSettings) {
  validateFreeform(settings);
  return dto(await prisma.journalNotebook.create({ data: { id: randomUUID(), ownerId, title: settings.title,
    coverStyle: settings.coverStyle, innerStyle: settings.innerStyle }, select: selection }));
}
export async function updateNotebook(ownerId: string, id: string, input: NotebookUpdate) {
  // 표지 변경에만 자유 입력 확인을 요구한다. 기록 선택 자체의 민감정보 동의는 원본 기록에 귀속된다.
  return prisma.$transaction(async tx => {
    const existing = await tx.journalNotebook.findFirst({ where: { id, ownerId }, select: { title: true } });
    if (!existing) throw new NotebookError("기록집을 찾지 못했어요.", 404);
    if (existing.title !== input.title) validateFreeform(input);
    const updated = await tx.journalNotebook.updateMany({ where: { id, ownerId, revision: input.revision },
      data: { title: input.title, coverStyle: input.coverStyle, innerStyle: input.innerStyle, revision: { increment: 1 } } });
    if (!updated.count) throw new NotebookError("다른 화면에서 기록집이 바뀌었어요. 다시 불러온 후 수정해주세요.", 409);
    // 선택한 원본을 잠가 철회/삭제된 기록이나 다른 계정의 기록을 연결하지 않는다.
    if (input.entryIds.length) await tx.$queryRaw`SELECT id FROM journal_entries WHERE owner_id = ${ownerId} AND id = ANY(${input.entryIds}::text[]) ORDER BY id FOR UPDATE`;
    const entries = await tx.journalEntry.findMany({ where: { ownerId, id: { in: input.entryIds } },
      select: { id: true, sensitiveContent: true, sensitiveConsentVersion: true, sensitiveWithdrawnAt: true } });
    if (entries.length !== input.entryIds.length) throw new NotebookError("선택한 기록이 없거나 삭제됐어요. 다시 골라주세요.", 409);
    entries.forEach(entry => assertSensitiveJournalReadable(entry));
    await tx.journalNotebookEntry.deleteMany({ where: { notebookId: id } });
    if (input.entryIds.length) await tx.journalNotebookEntry.createMany({ data: input.entryIds.map(entryId => ({ notebookId: id, entryId })) });
    return dto(await tx.journalNotebook.findFirstOrThrow({ where: { id, ownerId }, select: selection }));
  });
}
export async function deleteNotebook(ownerId: string, id: string, replay = false) {
  if (!await prisma.journalNotebook.findFirst({ where: { id, ownerId }, select: { id: true } })) throw new NotebookError("기록집을 찾지 못했어요.", 404);
  // PDF와 마찬가지로 기록집 삭제 원장에 남겨 백업 복원 후에도 다시 파기한다.
  const receipt = replay ? null : await preparePrivacyReplayReceipt("journal_book_deleted", ownerId, new Date(), id);
  const deleted = await prisma.journalNotebook.deleteMany({ where: { id, ownerId } });
  if (!deleted.count) throw new NotebookError("기록집을 찾지 못했어요.", 404);
  await commitPrivacyReplayReceipt(receipt);
}
