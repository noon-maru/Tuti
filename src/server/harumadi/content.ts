import { createHash } from "node:crypto";
import { prisma } from "@/server/db/prisma";
import { HarumadiError } from "./service";
import { journalEntrySelect, serializeJournalEntry } from "@/server/journal/service";
import { assertSensitiveJournalReadable } from "@/server/journal/sensitivePolicy";
import type { HarumadiContent } from "@/shared/api/harumadi";
import { harumadiTogetherEnabled, requireHarumadiAccess } from "./access";
import { sharedImageUrl } from "./media";

export async function readHarumadiContent(ownerId: string, id: string): Promise<HarumadiContent> {
  // 제목·연결·본문을 같은 스냅샷에서 읽어 도중의 삭제나 연결 변경을 섞지 않는다.
  return prisma.$transaction(async tx => {
    const access = harumadiTogetherEnabled() ? await requireHarumadiAccess(tx, ownerId, id) : null;
    const shared = Boolean(access?.collaborationStartedAt);
    const book = await tx.harumadi.findFirst({ where: { id, ...(access ? {} : { ownerId }) }, select: {
      id: true, title: true, coverStyle: true, backCoverText: true, revision: true, createdAt: true, updatedAt: true,
      entries: { select: { entry: { select: { ...journalEntrySelect, ...(shared ? { owner: { select: { displayName: true } } } : {}) } } } },
    } });
    if (!book) throw new HarumadiError("하루마디를 찾지 못했어요.", 404);
    const rows = book.entries.map(link => link.entry);
    // 철회가 아직 책 연결을 정리 중이라면 캐시로 우회하지 않는다.
    rows.forEach(entry => {
      if (!shared && entry.ownerId !== ownerId) throw new HarumadiError("마디를 확인할 수 없어요.", 403);
      assertSensitiveJournalReadable(entry);
      if (shared && entry.sensitiveContent !== false) throw new HarumadiError("공유할 수 없는 마디가 있어요. 작성자에게 확인해주세요.", 409);
    });
    const totalRecordCount = await tx.journalEntry.count({ where: { ownerId, sensitiveWithdrawnAt: null } });
    return {
      harumadi: { id: book.id, title: book.title, coverStyle: book.coverStyle as HarumadiContent["harumadi"]["coverStyle"],
        ...(access ? { togetherEnabled: true, shared, role: access.ownerId === ownerId ? "owner" as const : "contributor" as const } : {}),
        revision: book.revision,
        backCoverText: book.backCoverText,
        entryIds: rows.map(entry => entry.id), createdAt: book.createdAt.toISOString(), updatedAt: book.updatedAt.toISOString() },
      entries: rows.map(entry => ({ ...serializeJournalEntry(entry), ...(shared ? {
        authorId: entry.ownerId, authorName: entry.owner?.displayName || "함께하는 사람", image: entry.image ? sharedImageUrl(ownerId, id, entry.id, access!.accessRevision, entry.updatedAt.toISOString()) : null,
        publication: null, publicationStatus: "private" as const,
      } : {}) })), totalRecordCount,
      cacheable: !shared && rows.every(entry => entry.sensitiveContent === false),
      // 책 revision이 같아도 원본 마디의 제목·본문·사진 수정은 별도 버전이다.
      version: createHash("sha256").update(JSON.stringify({ layout: "automatic", revision: book.revision, updatedAt: book.updatedAt, accessRevision: access?.accessRevision,
        entries: rows.map(entry => [entry.id, entry.updatedAt]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))), totalRecordCount })).digest("hex"),
    };
  }, { isolationLevel: "RepeatableRead" });
}
