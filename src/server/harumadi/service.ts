import { randomUUID } from "node:crypto";
import { prisma } from "@/server/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { Harumadi, HarumadiSettings, HarumadiUpdate } from "@/shared/api/harumadi";
import { assertHarumadiPdfFreeform, assertSensitiveJournalReadable } from "@/server/journal/sensitivePolicy";
import { commitPrivacyReplayReceipt, preparePrivacyReplayReceipt } from "@/server/legal/privacyReplayLedger";
import { LEGACY_HARUMADI_BACK_COVER_TEXT, pickHarumadiBackCoverText } from "@/shared/harumadi/backCover";

export class HarumadiError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
const selection = {
  id: true, title: true, coverStyle: true, backCoverText: true, revision: true, createdAt: true, updatedAt: true,
  entries: { where: { entry: { sensitiveWithdrawnAt: null } }, select: { entryId: true } },
} as const;
type HarumadiRow = Prisma.HarumadiGetPayload<{ select: typeof selection }>;
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
  const cursor = cursorId ? await prisma.harumadi.findFirst({ where: { id: cursorId, ownerId }, select: { id: true, createdAt: true } }) : null;
  if (cursorId && !cursor) throw new HarumadiError("책장 위치를 다시 확인해주세요.");
  const rows = await prisma.harumadi.findMany({ where: { ownerId,
    ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}) },
    select: selection, take: 13, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  return { harumadis: rows.slice(0, 12).map(dto), nextCursor: rows.length > 12 ? rows[11].id : null,
    ...(!cursor ? { recordCount: await prisma.journalEntry.count({ where: { ownerId, sensitiveWithdrawnAt: null } }) } : {}) };
}
export async function readHarumadi(ownerId: string, id: string) {
  const row = await prisma.harumadi.findFirst({ where: { ownerId, id }, select: selection });
  if (!row) throw new HarumadiError("하루마디를 찾지 못했어요.", 404);
  return dto(row);
}
export async function createHarumadi(ownerId: string, settings: HarumadiSettings) {
  validateFreeform(settings);
  return prisma.$transaction(async tx => {
    // 첫 마디의 기본 하루마디 생성과 수동 생성을 같은 소유자 잠금으로 조정한다.
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${ownerId} FOR UPDATE`;
    return dto(await tx.harumadi.create({ data: { id: randomUUID(), ownerId, title: settings.title,
      coverStyle: settings.coverStyle, backCoverText: settings.backCoverText ?? pickHarumadiBackCoverText() }, select: selection }));
  });
}
export async function updateHarumadi(ownerId: string, id: string, input: HarumadiUpdate) {
  // 표지 변경에만 자유 입력 확인을 요구한다. 기록 선택 자체의 민감정보 동의는 원본 기록에 귀속된다.
  return prisma.$transaction(async tx => {
    const existing = await tx.harumadi.findFirst({ where: { id, ownerId }, select: { title: true, backCoverText: true } });
    if (!existing) throw new HarumadiError("하루마디를 찾지 못했어요.", 404);
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
    await tx.harumadiEntryLink.deleteMany({ where: { harumadiId: id } });
    if (input.entryIds.length) await tx.harumadiEntryLink.createMany({ data: input.entryIds.map(entryId => ({ harumadiId: id, entryId })) });
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
