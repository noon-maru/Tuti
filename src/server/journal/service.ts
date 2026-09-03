import { randomBytes } from "node:crypto";

import { Prisma } from "@/generated/prisma/client";
import {
  writeSystemLog,
  writeSystemLogSafely,
} from "@/server/admin/log";
import { prisma } from "@/server/db/prisma";
import {
  deleteStoredJournalImage,
  prepareJournalImage,
  serializeJournalImage,
} from "@/server/journal/imageStorage";
import {
  canOwnerPublishJournalEntry,
  isJournalEntryPublic,
} from "@/server/journal/publicationState";
import { assessJournalPublicationSafety } from "@/server/journal/publicationSafety";
import type {
  JournalEntryInput,
  TutiJournalEntry,
} from "@/shared/api/journal";
import { isCurrentJournalPublicationPolicy } from "@/shared/legal/journalPublicationPolicy";

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
      placeId: true,
      placeName: true,
      theme: true,
      difficulty: true,
      visitedAt: true,
      ownerId: true,
      updatedAt: true,
      publicId: true,
      publishedAt: true,
      publicationStatus: true,
      publicationStatusChangedAt: true,
    },
  });

  return entries.map(serializeJournalEntry);
}

export async function createJournalEntry(
  ownerId: string,
  input: JournalEntryInput,
): Promise<TutiJournalEntry> {
  const entryId = crypto.randomUUID();
  const selectedPlace = await resolveJournalPlace(input);
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
        placeId: selectedPlace.id,
        placeName: selectedPlace.name,
        theme: input.theme,
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
    select: {
      image: true,
      publicationStatus: true,
    },
  });

  if (!currentEntry) return null;

  const selectedPlace = await resolveJournalPlace(input);
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
        placeId: selectedPlace.id,
        placeName: selectedPlace.name,
        theme: input.theme,
        difficulty: input.difficulty,
        ...(currentEntry.publicationStatus !== "private"
          ? {
              publicationStatus:
                currentEntry.publicationStatus === "hidden"
                  ? ("hidden" as const)
                  : ("pending" as const),
              ...(currentEntry.publicationStatus === "hidden"
                ? {}
                : {
                    publishedAt: null,
                    publicationStatusChangedAt: new Date(),
                  }),
              publicationReviewReasons: [
                "content_changed_after_publication",
                ...assessJournalPublicationSafety({
                  title: input.title,
                  content: input.content,
                  image: preparedImage.image,
                  placeName: selectedPlace.name,
                  crowd: input.crowd,
                  theme: input.theme,
                  difficulty: input.difficulty,
                }).reasons,
              ],
              publicationReviewedAt: null,
              publicationReviewerUserId: null,
            }
          : {}),
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

  const result = await prisma.$transaction(async (transaction) => {
    await transaction.journalShareTrace.deleteMany({ where: { entryId } });
    await transaction.contentReport.updateMany({
      where: { entryId },
      data: { entryId: null },
    });

    return transaction.journalEntry.deleteMany({
      where: { id: entryId, ownerId },
    });
  });

  if (result.count > 0) {
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

  await prisma.$transaction(async (transaction) => {
    await transaction.journalShareTrace.deleteMany({ where: { entryId } });
    await transaction.contentReport.updateMany({
      where: { entryId },
      data: { entryId: null },
    });
    await transaction.journalEntry.delete({ where: { id: entryId } });
  });
  await cleanupReplacedImage(entry.image);
  return true;
}

export async function setJournalEntryPublication(
  ownerId: string,
  entryId: string,
  published: boolean,
  consentVersion?: string,
): Promise<TutiJournalEntry | null> {
  const currentEntry = await prisma.journalEntry.findFirst({
    where: { id: entryId, ownerId },
    select: journalEntrySelect,
  });

  if (!currentEntry) return null;

  if (published && !isCurrentJournalPublicationPolicy(consentVersion)) {
    throw new JournalPublicationStateError(
      "최신 기록 공개 안내를 확인해주세요.",
    );
  }

  if (
    (published &&
      (isJournalEntryPublic(currentEntry) ||
        currentEntry.publicationStatus === "pending")) ||
    (!published && currentEntry.publicationStatus === "private")
  ) {
    return serializeJournalEntry(currentEntry);
  }

  if (
    published &&
    !canOwnerPublishJournalEntry(currentEntry.publicationStatus)
  ) {
    throw new JournalPublicationStateError(
      "관리자 확인으로 숨겨진 기록은 다시 공개할 수 없어요.",
    );
  }

  if (!published && currentEntry.publicationStatus === "hidden") {
    throw new JournalPublicationStateError(
      "관리자가 숨긴 기록은 작성자가 공개 상태를 바꿀 수 없어요. 1:1 문의로 재검토를 요청해주세요.",
    );
  }

  if (published) {
    const owner = await prisma.user.findUnique({
      where: { id: ownerId },
      select: { journalPublicationRestrictedAt: true },
    });

    if (owner?.journalPublicationRestrictedAt) {
      throw new JournalPublicationStateError(
        "운영 정책에 따라 현재는 기록을 인터넷에 공개할 수 없어요.",
      );
    }
  }

  const safety = published
    ? assessJournalPublicationSafety(currentEntry)
    : null;
  const publicationStatus =
    safety?.decision === "review" ? "pending" : "published";
  const now = new Date();

  const entry = await prisma.$transaction(async (transaction) => {
    const result = await transaction.journalEntry.updateMany({
      where: { id: entryId, ownerId },
      data: published
        ? {
            publicId: randomBytes(24).toString("base64url"),
            publishedAt: publicationStatus === "published" ? now : null,
            publicationStatus,
            publicationStatusChangedAt: now,
            publicationReviewReasons: safety?.reasons ?? [],
            publicationReviewedAt:
              publicationStatus === "published" ? now : null,
            publicationReviewerUserId: null,
            publicationConsentVersion: consentVersion,
            publicationConsentedAt: now,
          }
        : {
            publicId: null,
            publishedAt: null,
            publicationStatus: "private",
            publicationStatusChangedAt: now,
            publicationReviewReasons: Prisma.DbNull,
            publicationReviewedAt: null,
            publicationReviewerUserId: null,
          },
    });
    if (result.count === 0) return null;

    const updatedEntry = await transaction.journalEntry.findUniqueOrThrow({
      where: { id: entryId },
      select: journalEntrySelect,
    });
    await writeSystemLog(
      {
        category: "journal",
        action: published ? "journal.published" : "journal.unpublished",
        message: published
          ? "기록이 공개되었습니다."
          : "기록 공개가 해제되었습니다.",
        actorUserId: ownerId,
        targetType: "journalEntry",
        targetId: entryId,
        metadata: published
          ? { consentVersion: consentVersion ?? null, publicationStatus }
          : undefined,
      },
      transaction,
    );
    return updatedEntry;
  });

  if (!entry) return null;

  return serializeJournalEntry(entry);
}

const journalEntrySelect = {
  id: true,
  title: true,
  content: true,
  image: true,
  crowd: true,
  placeId: true,
  placeName: true,
  theme: true,
  difficulty: true,
  visitedAt: true,
  ownerId: true,
  updatedAt: true,
  publicId: true,
  publishedAt: true,
  publicationStatus: true,
  publicationStatusChangedAt: true,
  publicationConsentVersion: true,
  publicationConsentedAt: true,
} as const;

function serializeJournalEntry(
  entry: Omit<
    TutiJournalEntry,
    "visitedAt" | "publication" | "publicationStatus"
  > & {
    ownerId: string;
    publicId: string | null;
    publishedAt: Date | null;
    publicationStatus: "private" | "pending" | "published" | "hidden";
    publicationStatusChangedAt: Date;
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
    placeId: entry.placeId,
    placeName: entry.placeName,
    theme: entry.theme,
    difficulty: entry.difficulty,
    visitedAt: entry.visitedAt.toISOString(),
    publicationStatus: entry.publicationStatus,
    publication:
      isJournalEntryPublic(entry)
        ? {
            publicId: entry.publicId!,
            publishedAt: entry.publishedAt!.toISOString(),
          }
        : null,
  };
}

export class JournalPublicationStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JournalPublicationStateError";
  }
}

async function resolveJournalPlace(input: JournalEntryInput) {
  if (!input.placeId) {
    return { id: null, name: input.placeName };
  }

  const place = await prisma.place.findFirst({
    where: {
      id: input.placeId,
      isActive: true,
      reviewStatus: "approved",
    },
    select: { id: true, name: true },
  });

  return place ?? { id: null, name: input.placeName };
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
