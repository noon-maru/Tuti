import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { prisma } from "../src/server/db/prisma";
import { deleteUserAccount } from "../src/server/admin/users";
import { mergeUserIntoCurrentAccount } from "../src/server/auth/accountMerge";
import {
  deleteJournalEntry,
  setJournalEntryPublication,
} from "../src/server/journal/service";
import { getPublicJournalEntry } from "../src/server/journal/publication";
import { JOURNAL_PUBLICATION_POLICY_VERSION } from "../src/shared/legal/journalPublicationPolicy";

if (process.env.TUTI_INSPECTION_ENV !== "development") {
  throw new Error(
    "기록 공개 통합 검증은 TUTI_INSPECTION_ENV=development에서만 실행할 수 있습니다.",
  );
}

const runId = randomUUID();
const ownerId = `journal-verification-owner-${runId}`;
const viewerId = `journal-verification-viewer-${runId}`;
const deletionOwnerId = `journal-verification-delete-${runId}`;
const mergeSourceId = `journal-verification-merge-source-${runId}`;
const mergeTargetId = `journal-verification-merge-target-${runId}`;
const cleanEntryId = `journal-verification-clean-${runId}`;
const imageEntryId = `journal-verification-image-${runId}`;
const reportId = `journal-verification-report-${runId}`;
const moderationLogId = `journal-verification-log-${runId}`;
const startedAt = new Date();

try {
  await prisma.user.createMany({
    data: [
      ownerId,
      viewerId,
      deletionOwnerId,
      mergeSourceId,
      mergeTargetId,
    ].map((id) => ({
      id,
      tokenHash: `verification-token-${id}`,
    })),
  });
  await prisma.journalEntry.createMany({
    data: [
      {
        id: cleanEntryId,
        ownerId,
        title: "공개 통합 검증 기록",
        content: "조용히 걸었던 시간을 남겼어요.",
        crowd: "한적함",
        placeName: "검증 공간",
        theme: "걷기 좋은",
        difficulty: "가벼움",
        visitedAt: startedAt,
      },
      {
        id: imageEntryId,
        ownerId,
        title: "이미지 검토 대기 기록",
        content: "관리자 확인 전에는 공개되지 않아요.",
        image: `journal-images/${ownerId}/${imageEntryId}/verification.webp`,
        crowd: "보통",
        placeName: "검증 공간",
        theme: "머물기 좋은",
        difficulty: "가벼움",
        visitedAt: startedAt,
      },
    ],
  });

  await assert.rejects(
    setJournalEntryPublication(ownerId, cleanEntryId, true, "old-policy"),
    /최신 기록 공개 안내/,
  );

  const firstPublication = await setJournalEntryPublication(
    ownerId,
    cleanEntryId,
    true,
    JOURNAL_PUBLICATION_POLICY_VERSION,
  );
  assert.equal(firstPublication?.publicationStatus, "published");
  const firstPublicId = firstPublication?.publication?.publicId;
  assert.ok(firstPublicId);
  assert.ok(await getPublicJournalEntry(firstPublicId, viewerId));

  await prisma.journalAuthorBlock.create({
    data: { blockerUserId: viewerId, blockedUserId: ownerId },
  });
  assert.equal(await getPublicJournalEntry(firstPublicId, viewerId), null);
  await prisma.journalAuthorBlock.delete({
    where: {
      blockerUserId_blockedUserId: {
        blockerUserId: viewerId,
        blockedUserId: ownerId,
      },
    },
  });

  await prisma.user.update({
    where: { id: mergeSourceId },
    data: {
      journalPublicationRestrictedAt: startedAt,
      journalPublicationRestrictionReason: "병합 승계 검증",
    },
  });
  await prisma.journalAuthorBlock.createMany({
    data: [
      { blockerUserId: mergeSourceId, blockedUserId: ownerId },
      { blockerUserId: mergeTargetId, blockedUserId: ownerId },
      { blockerUserId: viewerId, blockedUserId: mergeSourceId },
      { blockerUserId: mergeSourceId, blockedUserId: mergeTargetId },
    ],
  });
  await mergeUserIntoCurrentAccount({
    sourceUserId: mergeSourceId,
    targetUserId: mergeTargetId,
  });
  assert.equal(
    await prisma.journalAuthorBlock.count({
      where: { blockerUserId: mergeTargetId, blockedUserId: ownerId },
    }),
    1,
  );
  assert.equal(
    await prisma.journalAuthorBlock.count({
      where: { blockerUserId: viewerId, blockedUserId: mergeTargetId },
    }),
    1,
  );
  assert.equal(
    await prisma.journalAuthorBlock.count({
      where: {
        OR: [
          { blockerUserId: mergeSourceId },
          { blockedUserId: mergeSourceId },
          { blockerUserId: mergeTargetId, blockedUserId: mergeTargetId },
        ],
      },
    }),
    0,
  );
  const mergedTarget = await prisma.user.findUniqueOrThrow({
    where: { id: mergeTargetId },
    select: {
      journalPublicationRestrictedAt: true,
      journalPublicationRestrictionReason: true,
    },
  });
  assert.equal(
    mergedTarget.journalPublicationRestrictedAt?.toISOString(),
    startedAt.toISOString(),
  );
  assert.equal(
    mergedTarget.journalPublicationRestrictionReason,
    "병합 승계 검증",
  );

  await setJournalEntryPublication(ownerId, cleanEntryId, false);
  assert.equal(await getPublicJournalEntry(firstPublicId, viewerId), null);

  const secondPublication = await setJournalEntryPublication(
    ownerId,
    cleanEntryId,
    true,
    JOURNAL_PUBLICATION_POLICY_VERSION,
  );
  const secondPublicId = secondPublication?.publication?.publicId;
  assert.ok(secondPublicId);
  assert.notEqual(secondPublicId, firstPublicId);

  await prisma.journalEntry.update({
    where: { id: cleanEntryId },
    data: { publicationStatus: "hidden" },
  });
  assert.equal(await getPublicJournalEntry(secondPublicId, viewerId), null);
  await prisma.journalEntry.update({
    where: { id: cleanEntryId },
    data: { publicationStatus: "published" },
  });
  assert.ok(await getPublicJournalEntry(secondPublicId, viewerId));

  await setJournalEntryPublication(ownerId, cleanEntryId, false);
  await prisma.user.update({
    where: { id: ownerId },
    data: {
      journalPublicationRestrictedAt: new Date(),
      journalPublicationRestrictionReason: "통합 검증용 공개 제한",
    },
  });
  await assert.rejects(
    setJournalEntryPublication(
      ownerId,
      cleanEntryId,
      true,
      JOURNAL_PUBLICATION_POLICY_VERSION,
    ),
    /인터넷에 공개할 수 없어요/,
  );
  await prisma.user.update({
    where: { id: ownerId },
    data: {
      journalPublicationRestrictedAt: null,
      journalPublicationRestrictionReason: null,
    },
  });
  const finalPublication = await setJournalEntryPublication(
    ownerId,
    cleanEntryId,
    true,
    JOURNAL_PUBLICATION_POLICY_VERSION,
  );
  const finalPublicId = finalPublication?.publication?.publicId;
  assert.ok(finalPublicId);
  assert.notEqual(finalPublicId, secondPublicId);

  const pendingPublication = await setJournalEntryPublication(
    ownerId,
    imageEntryId,
    true,
    JOURNAL_PUBLICATION_POLICY_VERSION,
  );
  assert.equal(pendingPublication?.publicationStatus, "pending");
  const pendingRecord = await prisma.journalEntry.findUniqueOrThrow({
    where: { id: imageEntryId },
    select: { publicId: true },
  });
  assert.ok(pendingRecord.publicId);
  assert.equal(
    await getPublicJournalEntry(pendingRecord.publicId, viewerId),
    null,
  );

  await prisma.contentReport.create({
    data: {
      id: reportId,
      reporterUserId: viewerId,
      targetOwnerId: deletionOwnerId,
      targetTitle: "삭제 비식별 검증",
      reason: "other",
      status: "resolved",
      reviewedAt: startedAt,
    },
  });
  await prisma.systemLog.create({
    data: {
      id: moderationLogId,
      category: "moderation",
      action: "journal.verification",
      message: "계정 삭제 후 운영 이력 비식별 검증",
      actorUserId: deletionOwnerId,
      targetType: "user",
      targetId: deletionOwnerId,
    },
  });

  assert.ok(await deleteUserAccount(deletionOwnerId));
  const retainedReport = await prisma.contentReport.findUniqueOrThrow({
    where: { id: reportId },
  });
  const retainedLog = await prisma.systemLog.findUniqueOrThrow({
    where: { id: moderationLogId },
  });
  assert.notEqual(retainedReport.targetOwnerId, deletionOwnerId);
  assert.equal(retainedReport.entryId, null);
  assert.equal(retainedLog.actorUserId, null);
  assert.notEqual(retainedLog.targetId, deletionOwnerId);

  await prisma.journalShareTrace.create({
    data: {
      traceId: `journal-verification-trace-${runId}`,
      shortCode: randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase(),
      originUserId: ownerId,
      resolvedUserId: ownerId,
      entryId: cleanEntryId,
    },
  });
  assert.equal(await deleteJournalEntry(ownerId, cleanEntryId), true);
  assert.equal(
    await prisma.journalShareTrace.count({ where: { entryId: cleanEntryId } }),
    0,
  );
  assert.equal(await getPublicJournalEntry(finalPublicId, viewerId), null);

  console.log(
    JSON.stringify(
      {
        passed: true,
        runId,
        checkedAt: new Date().toISOString(),
        checks: [
          "outdated_consent_rejected",
          "clean_entry_published",
          "blocked_author_hidden",
          "account_merge_preserved_blocks_and_restriction",
          "unpublished_url_revoked",
          "republished_url_rotated",
          "moderation_hidden_and_restored",
          "restricted_owner_rejected",
          "image_entry_pending",
          "deleted_account_moderation_anonymized",
          "deleted_entry_trace_removed",
        ],
      },
      null,
      2,
    ),
  );
} finally {
  await prisma.contentReport.deleteMany({ where: { id: reportId } });
  await prisma.systemLog.deleteMany({
    where: {
      OR: [
        { id: moderationLogId },
        { targetId: { in: [cleanEntryId, imageEntryId] } },
        {
          actorUserId: {
            in: [
              ownerId,
              viewerId,
              deletionOwnerId,
              mergeSourceId,
              mergeTargetId,
            ],
          },
        },
      ],
    },
  });
  await prisma.journalShareTrace.deleteMany({
    where: { entryId: { in: [cleanEntryId, imageEntryId] } },
  });
  await prisma.journalEntry.deleteMany({
    where: { id: { in: [cleanEntryId, imageEntryId] } },
  });
  await prisma.user.deleteMany({
    where: {
      id: {
        in: [
          ownerId,
          viewerId,
          deletionOwnerId,
          mergeSourceId,
          mergeTargetId,
        ],
      },
    },
  });
  await prisma.$disconnect();
}
