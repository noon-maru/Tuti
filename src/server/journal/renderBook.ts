import sharp from "sharp";

import { prisma } from "@/server/db/prisma";
import { isStoredJournalImage } from "@/server/journal/imageStorage";
import {
  renderJournalBook,
  type PreparedBookEntry,
} from "@/server/pdf/journalBook";
import { getObject } from "@/server/storage/objectStorage";
import type { JournalBookInput } from "@/shared/api/journalBook";

export async function renderOwnedJournalBook(
  ownerId: string,
  input: JournalBookInput,
) {
  const entries = await prisma.journalEntry.findMany({
    where: { ownerId, id: { in: input.entryIds } },
    select: {
      id: true,
      title: true,
      content: true,
      placeName: true,
      visitedAt: true,
      image: true,
    },
  });

  if (
    entries.length !== input.entryIds.length ||
    !input.entryIds.every((id) => entries.some((entry) => entry.id === id))
  ) {
    throw new JournalBookRenderError(
      "선택한 기록을 찾지 못했어요. 기록을 다시 골라주세요.",
      404,
    );
  }

  if (
    entries.reduce(
      (length, entry) =>
        length + entry.content.length + entry.title.length + entry.placeName.length,
      0,
    ) > 60_000
  ) {
    throw new JournalBookRenderError(
      "글이 많아 한 번에 만들기 어려워요. 기록을 나누어 골라주세요.",
      413,
    );
  }

  entries.sort(
    (a, b) =>
      a.visitedAt.getTime() - b.visitedAt.getTime() || a.id.localeCompare(b.id),
  );

  const prepared: PreparedBookEntry[] = [];
  for (const entry of entries) {
    let image: Buffer | null = null;
    if (entry.image) {
      if (!isStoredJournalImage(entry.image))
        throw new JournalBookRenderError("지원하지 않는 사진이에요.", 400);
      const stored = await getObject(entry.image);
      if (stored.contentLength && stored.contentLength > 5 * 1024 * 1024)
        throw new JournalBookRenderError("사진 용량이 너무 커요.", 413);
      const bytes = await stored.body.transformToByteArray();
      if (bytes.byteLength > 5 * 1024 * 1024)
        throw new JournalBookRenderError("사진 용량이 너무 커요.", 413);
      image = await sharp(bytes, { limitInputPixels: 16_000_000 })
        .rotate()
        .resize({
          width: 1200,
          height: 1200,
          fit: "inside",
          withoutEnlargement: true,
        })
        .flatten({ background: "#FFFFFF" })
        .jpeg({ quality: 88 })
        .toBuffer();
    }
    prepared.push({ ...entry, image });
  }

  return renderJournalBook(input, prepared);
}

export class JournalBookRenderError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "JournalBookRenderError";
  }
}
