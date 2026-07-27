import { randomBytes } from "node:crypto";

import { writeSystemLogSafely } from "@/server/admin/log";
import { prisma } from "@/server/db/prisma";
import {
  deleteStoredJournalImage,
  prepareJournalImage,
  serializeJournalImage,
} from "@/server/journal/imageStorage";
import type {
  JournalEntryInput,
  TutiJournalEntry,
} from "@/shared/api/journal";

export async function getJournalEntries(
  ownerId: string,
): Promise<TutiJournalEntry[]> {
  const entries = await prisma.journalEntry.findMany({
    where: { ownerId },
    orderBy: [{ visitedAt: "desc" }, { id: "asc" }],
    select: {
      id: true,
      title: true,
      content: true,
      image: true,
      crowd: true,
      placeName: true,
      difficulty: true,
      visitedAt: true,
      ownerId: true,
      updatedAt: true,
      publicId: true,
      publishedAt: true,
    },
  });

  return entries.map(serializeJournalEntry);
}

export async function createJournalEntry(
  ownerId: string,
  input: JournalEntryInput,
): Promise<TutiJournalEntry> {
  const entryId = crypto.randomUUID();
  const preparedImage = await prepareJournalImage({
    ownerId,
    entryId,
    image: input.image,
  });

  try {
    const entry = await prisma.journalEntry.create({
      data: {
        id: entryId,
        ownerId,
        title: input.title,
        content: input.content,
        image: preparedImage.image,
        crowd: input.crowd,
        placeName: input.placeName,
        difficulty: input.difficulty,
        visitedAt: input.visitedAt ? new Date(input.visitedAt) : new Date(),
      },
      select: journalEntrySelect,
    });

    await writeSystemLogSafely({
      category: "journal",
      action: "journal.created",
      message: "새 기록이 작성되었습니다.",
      actorUserId: ownerId,
      targetType: "journalEntry",
      targetId: entry.id,
    });

    return serializeJournalEntry(entry);
  } catch (error) {
    await cleanupUploadedImage(preparedImage.uploadedKey);
    throw error;
  }
}

export async function updateJournalEntry(
  ownerId: string,
  entryId: string,
  input: JournalEntryInput,
): Promise<TutiJournalEntry | null> {
  const currentEntry = await prisma.journalEntry.findFirst({
    where: { id: entryId, ownerId },
    select: { image: true },
  });

  if (!currentEntry) return null;

  const preparedImage = await prepareJournalImage({
    ownerId,
    entryId,
    image: input.image,
    currentImage: currentEntry.image,
  });

  let result: { count: number };

  try {
    result = await prisma.journalEntry.updateMany({
      where: { id: entryId, ownerId },
      data: {
        title: input.title,
        content: input.content,
        image: preparedImage.image,
        crowd: input.crowd,
        placeName: input.placeName,
        difficulty: input.difficulty,
        ...(input.visitedAt
          ? { visitedAt: new Date(input.visitedAt) }
          : {}),
      },
    });
  } catch (error) {
    await cleanupUploadedImage(preparedImage.uploadedKey);
    throw error;
  }

  if (result.count === 0) {
    await cleanupUploadedImage(preparedImage.uploadedKey);
    return null;
  }

  const entry = await prisma.journalEntry.findUniqueOrThrow({
    where: { id: entryId },
    select: journalEntrySelect,
  });

  if (currentEntry.image !== preparedImage.image) {
    await cleanupReplacedImage(currentEntry.image);
  }

  await writeSystemLogSafely({
    category: "journal",
    action: "journal.updated",
    message: "기록이 수정되었습니다.",
    actorUserId: ownerId,
    targetType: "journalEntry",
    targetId: entryId,
  });

  return serializeJournalEntry(entry);
}

export async function deleteJournalEntry(
  ownerId: string,
  entryId: string,
) {
  const entry = await prisma.journalEntry.findFirst({
    where: { id: entryId, ownerId },
    select: { image: true },
  });

  if (!entry) return false;

  const result = await prisma.journalEntry.deleteMany({
    where: { id: entryId, ownerId },
  });

  if (result.count > 0) {
    await prisma.contentReport.updateMany({
      where: { entryId },
      data: { entryId: null },
    });
    await cleanupReplacedImage(entry.image);
    await writeSystemLogSafely({
      category: "journal",
      action: "journal.deleted",
      message: "사용자가 기록을 삭제했습니다.",
      actorUserId: ownerId,
      targetType: "journalEntry",
      targetId: entryId,
    });
  }

  return result.count > 0;
}

export async function forceDeleteJournalEntry(entryId: string) {
  const entry = await prisma.journalEntry.findUnique({
    where: { id: entryId },
    select: { image: true },
  });

  if (!entry) return false;

  await prisma.journalEntry.delete({ where: { id: entryId } });
  await prisma.contentReport.updateMany({
    where: { entryId },
    data: { entryId: null },
  });
  await cleanupReplacedImage(entry.image);
  return true;
}

export async function setJournalEntryPublication(
  ownerId: string,
  entryId: string,
  published: boolean,
): Promise<TutiJournalEntry | null> {
  const currentEntry = await prisma.journalEntry.findFirst({
    where: { id: entryId, ownerId },
    select: journalEntrySelect,
  });

  if (!currentEntry) return null;

  if (
    published ===
    Boolean(currentEntry.publicId && currentEntry.publishedAt)
  ) {
    return serializeJournalEntry(currentEntry);
  }

  const result = await prisma.journalEntry.updateMany({
    where: { id: entryId, ownerId },
    data: published
      ? {
          publicId: randomBytes(24).toString("base64url"),
          publishedAt: new Date(),
        }
      : {
          publicId: null,
          publishedAt: null,
        },
  });

  if (result.count === 0) return null;

  const entry = await prisma.journalEntry.findUniqueOrThrow({
    where: { id: entryId },
    select: journalEntrySelect,
  });

  await writeSystemLogSafely({
    category: "journal",
    action: published ? "journal.published" : "journal.unpublished",
    message: published
      ? "기록이 공개되었습니다."
      : "기록 공개가 해제되었습니다.",
    actorUserId: ownerId,
    targetType: "journalEntry",
    targetId: entryId,
  });

  return serializeJournalEntry(entry);
}

const journalEntrySelect = {
  id: true,
  title: true,
  content: true,
  image: true,
  crowd: true,
  placeName: true,
  difficulty: true,
  visitedAt: true,
  ownerId: true,
  updatedAt: true,
  publicId: true,
  publishedAt: true,
} as const;

function serializeJournalEntry(
  entry: Omit<TutiJournalEntry, "visitedAt" | "publication"> & {
    ownerId: string;
    publicId: string | null;
    publishedAt: Date | null;
    updatedAt: Date;
    visitedAt: Date;
  },
): TutiJournalEntry {
  return {
    id: entry.id,
    title: entry.title,
    content: entry.content,
    image: serializeJournalImage(entry),
    crowd: entry.crowd,
    placeName: entry.placeName,
    difficulty: entry.difficulty,
    visitedAt: entry.visitedAt.toISOString(),
    publication:
      entry.publicId && entry.publishedAt
        ? {
            publicId: entry.publicId,
            publishedAt: entry.publishedAt.toISOString(),
          }
        : null,
  };
}

async function cleanupUploadedImage(image: string | null) {
  if (!image) return;

  try {
    await deleteStoredJournalImage(image);
  } catch (error) {
    console.error("저장에 실패한 저널 이미지를 정리하지 못했습니다.", error);
  }
}

async function cleanupReplacedImage(image: string | null) {
  try {
    await deleteStoredJournalImage(image);
  } catch (error) {
    console.error("교체되거나 삭제된 저널 이미지를 정리하지 못했습니다.", error);
  }
}
