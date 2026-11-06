import { createHash, randomBytes } from "node:crypto";
import { recordContribution, recordLifecycle } from "@/server/analytics/lifecycle";
import type { LifecycleContext } from "@/shared/api/lifecycle";

import { Prisma } from "@/generated/prisma/client";
import {
  writeSystemLog,
  writeSystemLogSafely,
} from "@/server/admin/log";
import { prisma } from "@/server/db/prisma";
import { assertSensitiveJournalReadable, sensitiveJournalData, sensitiveJournalPolicyEnabled, SensitiveJournalPolicyError } from "@/server/journal/sensitivePolicy";
import {
  deleteStoredJournalImage,
  prepareJournalImage,
  serializeJournalImage,
} from "@/server/journal/imageStorage";
import {
  canOwnerPublishJournalEntry,
  isJournalEntryPublic,
} from "@/server/journal/publicationState";
import type {
  JournalEntryInput,
  TutiJournalEntry,
} from "@/shared/api/journal";
import { isCurrentJournalPublicationPolicy } from "@/shared/legal/journalPublicationPolicy";
import { commitPrivacyReplayReceipt, preparePrivacyReplayReceipt } from "@/server/legal/privacyReplayLedger";
import { createDefaultHarumadiForFirstMadi } from "@/server/harumadi/firstMadi";
import { lockHarumadi, requireHarumadiAccess, requireTogether, harumadiTogetherEnabled } from "@/server/harumadi/access";
import { HarumadiError } from "@/server/harumadi/errors";
import { enqueueDataCleanup, processDataCleanupJob } from "@/server/legal/dataCleanup";

export class JournalEditConflictError extends Error {
  readonly status = 409;
  constructor() { super("다른 화면에서 마디가 바뀌었어요. 작성 중인 내용은 그대로 두고 최신 마디를 확인해주세요."); }
}

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
      placeId: true,
      placeName: true,
      visitedAt: true,
      ownerId: true,
      updatedAt: true,
      publicId: true,
      publishedAt: true,
      publicationStatus: true,
      publicationStatusChangedAt: true,
      sensitiveContent: true,
      sensitiveConsentVersion: true,
      sensitiveWithdrawnAt: true,
    },
  });

  return entries.map(serializeJournalEntry);
}

export async function createJournalEntry(
  ownerId: string,
  input: JournalEntryInput,
  context: LifecycleContext = {},
): Promise<TutiJournalEntry> {
  const sensitiveData = sensitiveJournalData(input);
  const entryId = crypto.randomUUID();
  const selectedPlace = await resolveJournalPlace(input);
  const preparedImage = await prepareJournalImage({
    ownerId,
    entryId,
    image: input.image,
  });

  try {
    const entry = await prisma.$transaction(async tx => {
      // 첫 마디 판단과 하루마디 생성을 계정별로 직렬화한다.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${ownerId} FOR UPDATE`;
      const requestKey = input.requestId ? `madi-request:${ownerId}:${input.requestId}` : undefined;
      const requestHash = requestKey ? createHash("sha256").update(JSON.stringify(input)).digest("hex") : undefined;
      if (requestKey && tx.lifecycleEvent) {
        const receipt = await tx.lifecycleEvent.findUnique({ where: { requestKey } });
        if (receipt) {
          if (receipt.requestHash !== requestHash) throw new HarumadiError("저장 요청 내용이 바뀌었어요. 새 작성으로 다시 시도해주세요.", 409);
          const prior = receipt.entityId ? await tx.journalEntry.findFirst({ where: { id: receipt.entityId, ownerId }, select: journalEntrySelect }) : null;
          if (!prior) throw new HarumadiError("이미 처리되거나 삭제된 저장 요청이에요. 새로 작성해주세요.", 409);
          assertSensitiveJournalReadable(prior);
          // 연결이 해제되거나 참여 권한을 잃었다면 예전 책의 이름을 다시 노출하지 않는다.
          const book = receipt.bookId ? await tx.harumadi.findFirst({ where: {
            id: receipt.bookId, entries: { some: { entryId: prior.id } },
            OR: [{ ownerId }, ...(harumadiTogetherEnabled() ? [{ members: { some: { userId: ownerId, endedAt: null } } }] : [])],
          }, select: { id: true, title: true } }) : null;
          return { ...prior, savedHarumadi: book ? { id: book.id, title: book.title } : null };
        }
      }
      let savedHarumadi: { id: string; title: string } | null = null;
      if (input.harumadiId) {
        await lockHarumadi(tx, input.harumadiId);
        const book = await requireHarumadiAccess(tx, ownerId, input.harumadiId);
        savedHarumadi = { id: book.id, title: book.title };
        if (book.collaborationStartedAt) requireTogether();
        if (book.collaborationStartedAt && sensitiveData.sensitiveContent !== false) throw new HarumadiError("민감정보가 없는 마디만 함께 채울 수 있어요.", 409);
      }
      const created = await tx.journalEntry.create({
        data: {
          id: entryId,
          ownerId,
          ...sensitiveData,
          title: input.title,
          content: input.content,
          image: preparedImage.image,
          placeId: selectedPlace.id,
          placeName: selectedPlace.name,
          visitedAt: input.visitedAt ? new Date(input.visitedAt) : new Date(),
        },
        select: journalEntrySelect,
      });
      if (input.harumadiId) {
        const link = await tx.harumadiEntryLink.create({ data: { harumadiId: input.harumadiId, entryId: created.id } });
        await recordContribution(tx, ownerId, input.harumadiId, created.id, link.id, context);
        await tx.harumadi.update({ where: { id: input.harumadiId }, data: { revision: { increment: 1 } } });
      } else savedHarumadi = await createDefaultHarumadiForFirstMadi(tx, ownerId, created, context) ?? null;
      await recordLifecycle(tx, ownerId, { name: "madi_created", key: `madi:${created.id}`, entityId: created.id, bookId: savedHarumadi?.id, requestKey, requestHash }, context);
      return { ...created, savedHarumadi };
    });

    if (entry.id !== entryId) {
      await cleanupUploadedImage(preparedImage.uploadedKey);
      return { ...serializeJournalEntry(entry), savedHarumadi: entry.savedHarumadi };
    }

    await writeSystemLogSafely({
      category: "journal",
      action: "journal.created",
      message: "새 기록이 작성되었습니다.",
      actorUserId: ownerId,
      targetType: "journalEntry",
      targetId: entry.id,
    });

    return { ...serializeJournalEntry(entry), savedHarumadi: entry.savedHarumadi };
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
  const sensitiveData = sensitiveJournalData(input);
  const currentEntry = await prisma.journalEntry.findFirst({
    where: { id: entryId, ownerId },
    select: {
      image: true,
      publicationStatus: true,
      sensitiveWithdrawnAt: true,
      sensitiveContent: true,
      updatedAt: true,
    },
  });

  if (!currentEntry) return null;
  const expectedVersion = input.expectedVersion ?? currentEntry.updatedAt.toISOString();
  if (currentEntry.updatedAt.toISOString() !== expectedVersion) throw new JournalEditConflictError();
  if (currentEntry.sensitiveWithdrawnAt) throw new SensitiveJournalPolicyError("동의 철회로 정리 중인 마디는 수정할 수 없어요.");
  if (currentEntry.sensitiveContent === true && input.sensitiveContent !== true) {
    throw new SensitiveJournalPolicyError("민감정보가 담긴 마디를 일반 마디로 바꾸려면 먼저 동의를 철회해 삭제한 뒤 새 마디로 남겨주세요.");
  }

  const selectedPlace = await resolveJournalPlace(input);
  const preparedImage = await prepareJournalImage({
    ownerId,
    entryId,
    image: input.image,
    currentImage: currentEntry.image,
  });

  let result: { count: number; cleanupJobId: string | null };

  try {
    result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM journal_entries WHERE id = ${entryId} AND owner_id = ${ownerId} FOR UPDATE`;
      const locked = await tx.journalEntry.findFirst({ where: { id: entryId, ownerId }, select: { updatedAt: true } });
      if (!locked || locked.updatedAt.toISOString() !== expectedVersion) throw new JournalEditConflictError();
      if (input.sensitiveContent === true && await tx.harumadiEntryLink.findFirst({ where: { entryId, harumadi: { collaborationStartedAt: { not: null } } }, select: { id: true } })) throw new SensitiveJournalPolicyError("함께 채우는 하루마디에서 먼저 마디를 뺀 뒤 민감정보 여부를 변경해주세요.");
      const changed = await tx.journalEntry.updateMany({
      where: { id: entryId, ownerId, sensitiveWithdrawnAt: null, updatedAt: locked.updatedAt },
      data: {
        updatedAt: new Date(Math.max(Date.now(), locked.updatedAt.getTime() + 1)),
        ...sensitiveData,
        title: input.title,
        content: input.content,
        image: preparedImage.image,
        placeId: selectedPlace.id,
        placeName: selectedPlace.name,
        ...(currentEntry.publicationStatus !== "private"
          ? {
              publicationStatus:
                currentEntry.publicationStatus === "hidden"
                  ? ("hidden" as const)
                  : ("published" as const),
              publicationReviewReasons: Prisma.DbNull,
              publicationReviewedAt: null,
              publicationReviewerUserId: null,
            }
          : {}),
        ...(input.visitedAt
          ? { visitedAt: new Date(input.visitedAt) }
          : {}),
        // 공개된 기록을 민감정보 포함 기록으로 바꾸면 같은 쓰기에서 공개도 해제한다.
        ...(input.sensitiveContent === true ? {
          publicId: null, publishedAt: null, publicationStatus: "private" as const,
          publicationStatusChangedAt: new Date(),
        } : {}),
      },
    });
      const cleanupJobId = changed.count && currentEntry.image && currentEntry.image !== preparedImage.image
        ? await enqueueDataCleanup(tx, { images: [currentEntry.image], pdfs: [], appleTokens: [], receipt: null }) : null;
      return { count: changed.count, cleanupJobId };
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

  if (result.cleanupJobId) await processDataCleanupJob(result.cleanupJobId).catch(() => false);

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
    select: { image: true, sensitiveContent: true, sensitiveWithdrawnAt: true },
  });

  if (!entry) return false;
  if (entry.sensitiveContent === true || entry.sensitiveWithdrawnAt) {
    const { withdrawSensitiveJournal } = await import("@/server/journal/sensitiveWithdrawal");
    const result = await withdrawSensitiveJournal(ownerId, entryId);
    if (result.pending) throw new SensitiveJournalPolicyError("동의 철회는 접수했어요. 마디와 하루마디 정리를 재시도 중이에요.");
    return result.found;
  }
  const replayReceipt = await preparePrivacyReplayReceipt("journal_deleted", ownerId, new Date(), entryId);

  const result = await prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT id FROM journal_entries WHERE id = ${entryId} AND owner_id = ${ownerId} FOR UPDATE`;
    const current = await transaction.journalEntry.findFirst({ where: { id: entryId, ownerId }, select: { image: true, sensitiveContent: true, sensitiveWithdrawnAt: true } });
    if (!current) return { count: 0, cleanupJobId: null };
    if (current.sensitiveContent === true || current.sensitiveWithdrawnAt) throw new JournalEditConflictError();
    await transaction.journalShareTrace.deleteMany({ where: { entryId } });
    await transaction.contentReport.updateMany({
      where: { entryId },
      data: { entryId: null },
    });

    const deleted = await transaction.journalEntry.deleteMany({
      where: { id: entryId, ownerId },
    });
    const cleanupJobId = await enqueueDataCleanup(transaction, { images: current.image ? [current.image] : [], pdfs: [], appleTokens: [], receipt: replayReceipt });
    return { count: deleted.count, cleanupJobId };
  });
  if (result.cleanupJobId) await processDataCleanupJob(result.cleanupJobId).catch(() => false);

  if (result.count > 0) {
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

export async function forceDeleteJournalEntry(entryId: string, replay = false) {
  const entry = await prisma.journalEntry.findUnique({
    where: { id: entryId },
    select: { image: true, ownerId: true },
  });

  if (!entry) return false;
  const replayReceipt = replay ? null : await preparePrivacyReplayReceipt("journal_deleted", entry.ownerId, new Date(), entryId);

  const cleanupJobId = await prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT id FROM journal_entries WHERE id = ${entryId} FOR UPDATE`;
    const current = await transaction.journalEntry.findUnique({ where: { id: entryId }, select: { image: true, ownerId: true } });
    if (!current) return null;
    if (current.ownerId !== entry.ownerId) throw new JournalEditConflictError();
    await transaction.journalShareTrace.deleteMany({ where: { entryId } });
    await transaction.contentReport.updateMany({
      where: { entryId },
      data: { entryId: null },
    });
    await transaction.journalEntry.delete({ where: { id: entryId } });
    return enqueueDataCleanup(transaction, { images: current.image ? [current.image] : [], pdfs: [], appleTokens: [], receipt: replayReceipt });
  });
  if (cleanupJobId) await processDataCleanupJob(cleanupJobId).catch(() => false);
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

  if (published && (currentEntry.sensitiveWithdrawnAt || currentEntry.sensitiveContent === true ||
      (sensitiveJournalPolicyEnabled() && currentEntry.sensitiveContent !== false))) {
    throw new JournalPublicationStateError("민감정보가 포함된 마디는 공개할 수 없어요. 마디 수정에서 사진과 글을 확인해주세요.");
  }

  if (published && !isCurrentJournalPublicationPolicy(consentVersion)) {
    throw new JournalPublicationStateError(
      "최신 마디 공개 안내를 확인해주세요.",
    );
  }

  // 이미 비공개인 기록에 대한 재요청도 과거 백업의 공개 링크 복원을 막는다.
  const replayReceipt = !published && currentEntry.publicationStatus !== "hidden"
    ? await preparePrivacyReplayReceipt("journal_unpublished", ownerId, new Date(), entryId) : null;

  if (
    (published &&
      isJournalEntryPublic(currentEntry)) ||
    (!published && currentEntry.publicationStatus === "private")
  ) {
    await commitPrivacyReplayReceipt(replayReceipt);
    return serializeJournalEntry(currentEntry);
  }

  if (
    published &&
    !canOwnerPublishJournalEntry(currentEntry.publicationStatus)
  ) {
    throw new JournalPublicationStateError(
      "관리자 조치로 숨겨진 마디는 다시 공개할 수 없어요.",
    );
  }

  if (!published && currentEntry.publicationStatus === "hidden") {
    throw new JournalPublicationStateError(
      "관리자가 숨긴 마디는 작성자가 공개 상태를 바꿀 수 없어요. 1:1 문의로 재검토를 요청해주세요.",
    );
  }

  if (published) {
    const owner = await prisma.user.findUnique({
      where: { id: ownerId },
      select: { journalPublicationRestrictedAt: true },
    });

    if (owner?.journalPublicationRestrictedAt) {
      throw new JournalPublicationStateError(
        "운영 정책에 따라 현재는 마디를 인터넷에 공개할 수 없어요.",
      );
    }
  }

  const publicationStatus = "published";
  const now = new Date();

  const entry = await prisma.$transaction(async (transaction) => {
    // 계정 제한 변경은 사용자 행, 숨김·수정은 마디 행과 직렬화한다.
    await transaction.$queryRaw`SELECT id FROM users WHERE id = ${ownerId} FOR UPDATE`;
    await transaction.$queryRaw`SELECT id FROM journal_entries WHERE id = ${entryId} AND owner_id = ${ownerId} FOR UPDATE`;
    const current = await transaction.journalEntry.findFirst({ where: { id: entryId, ownerId }, select: journalEntrySelect });
    if (!current) return null;
    if (current.publicationStatus === "hidden") throw new JournalPublicationStateError("관리자가 숨긴 마디는 공개 상태를 바꿀 수 없어요.");
    if (published) {
      const owner = await transaction.user.findUnique({ where: { id: ownerId }, select: { journalPublicationRestrictedAt: true } });
      if (!owner || owner.journalPublicationRestrictedAt) throw new JournalPublicationStateError("현재는 마디를 인터넷에 공개할 수 없어요.");
    }
    const result = await transaction.journalEntry.updateMany({
      where: { id: entryId, ownerId, updatedAt: current.updatedAt, publicationStatus: current.publicationStatus, ...(published ? {
        sensitiveWithdrawnAt: null,
        ...(sensitiveJournalPolicyEnabled() ? { sensitiveContent: false } : { OR: [{ sensitiveContent: false }, { sensitiveContent: null }] }),
      } : {}) },
      data: published
        ? {
            publicId: randomBytes(24).toString("base64url"),
            publishedAt: now,
            publicationStatus,
            publicationStatusChangedAt: now,
            publicationReviewReasons: Prisma.DbNull,
            publicationReviewedAt: null,
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
          ? "마디가 공개되었습니다."
          : "마디 공개가 해제되었습니다.",
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

  await commitPrivacyReplayReceipt(replayReceipt);

  return serializeJournalEntry(entry);
}

export const journalEntrySelect = {
  id: true,
  sensitiveContent: true,
  sensitiveConsentVersion: true,
  sensitiveWithdrawnAt: true,
  title: true,
  content: true,
  image: true,
  placeId: true,
  placeName: true,
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

export function serializeJournalEntry(
  entry: Omit<
    TutiJournalEntry,
    "visitedAt" | "publication" | "publicationStatus" | "sensitiveWithdrawnAt"
  > & {
    ownerId: string;
    publicId: string | null;
    publishedAt: Date | null;
    publicationStatus: "private" | "pending" | "published" | "hidden";
    publicationStatusChangedAt: Date;
    updatedAt: Date;
    visitedAt: Date;
    sensitiveWithdrawnAt?: Date | null;
  },
): TutiJournalEntry {
  return {
    id: entry.id,
    version: entry.updatedAt.toISOString(),
    sensitiveContent: entry.sensitiveContent,
    sensitiveConsentVersion: entry.sensitiveConsentVersion,
    sensitiveWithdrawnAt: entry.sensitiveWithdrawnAt?.toISOString() ?? null,
    title: entry.sensitiveWithdrawnAt ? "정리 중인 마디" : entry.title,
    content: entry.sensitiveWithdrawnAt ? "동의 철회로 마디와 하루마디를 정리하고 있어요." : entry.content,
    image: entry.sensitiveWithdrawnAt ? null : serializeJournalImage(entry),
    placeId: entry.sensitiveWithdrawnAt ? null : entry.placeId,
    placeName: entry.sensitiveWithdrawnAt ? "남긴 공간" : entry.placeName,
    visitedAt: (entry.sensitiveWithdrawnAt ?? entry.visitedAt).toISOString(),
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
