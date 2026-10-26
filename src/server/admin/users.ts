import { createHash, randomUUID } from "node:crypto";
import { deleteStoredJournalImage } from "@/server/journal/imageStorage";
import { deleteStoredJournalBook } from "@/server/journal/bookStorage";
import { prisma } from "@/server/db/prisma";
import type { LocationSecurityAuditData } from "@/server/location/securityAudit";
import { getRequiredAuthEnv } from "@/server/auth/config";
import { revokeAppleRefreshToken } from "@/server/auth/appleOAuth";
import { lockLocationSubject } from "@/server/location/subjectLock";
import { commitPrivacyReplayReceipt, preparePrivacyReplayReceipt, privacyReplayEnabled } from "@/server/legal/privacyReplayLedger";
import { LEGACY_ADMIN_JOURNAL_ACCESS_AUDIT } from "@/server/admin/journalAccessAudit";

export async function forceDeleteUser(
  userId: string,
  permissionAudit?: LocationSecurityAuditData,
) {
  return deleteUserRecord(userId, {
    permissionAudit,
    requireCompleteImageDeletion: false,
  });
}

export async function deleteUserAccount(userId: string) {
  return deleteUserRecord(userId, {
    requireCompleteImageDeletion: true,
  });
}

// 운영자가 승인한 과거 빈 일반 계정만 정리한다. 잠금 후 다시 확인하므로
// 준비 이후 기록을 남겼거나 관리자로 승격된 계정은 삭제하지 않는다.
export async function deleteEmptyOrdinaryAccount(userId: string, createdBefore: Date) {
  if (!Number.isFinite(createdBefore.getTime())) throw new Error("정리 기준 시각이 필요합니다.");
  return deleteUserRecord(userId, { requireCompleteImageDeletion: true, emptyCreatedBefore: createdBefore });
}

export async function deleteOrdinaryTestAccount(userId: string, createdBefore: Date) {
  if (!Number.isFinite(createdBefore.getTime())) throw new Error("정리 기준 시각이 필요합니다.");
  return deleteUserRecord(userId, { requireCompleteImageDeletion: true, ordinaryCreatedBefore: createdBefore });
}

// 복원 후 앱이 중지된 상태에서만 사용하는 내부 정리 경로. 이미 철회한 Apple 토큰을
// 외부로 다시 보내지 않고, 기존 원장 기록을 새 삭제 요청으로 복제하지 않는다.
export async function replayDeletedUserAccount(userId: string) {
  return deleteUserRecord(userId, { requireCompleteImageDeletion: true, replay: true });
}

async function deleteUserRecord(
  userId: string,
  {
    permissionAudit,
    requireCompleteImageDeletion,
    replay = false,
    emptyCreatedBefore,
    ordinaryCreatedBefore,
  }: {
    permissionAudit?: LocationSecurityAuditData;
    requireCompleteImageDeletion: boolean;
    replay?: boolean;
    emptyCreatedBefore?: Date;
    ordinaryCreatedBefore?: Date;
  },
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      createdAt: true,
      authIdentities: {
        select: {
          email: true,
          provider: true,
          providerRefreshTokenEncrypted: true,
        },
      },
      journalEntries: {
        select: {
          id: true,
          image: true,
        },
      },
      journalBooks: {
        select: { objectKey: true },
      },
      _count: { select: { journalNotebooks: true } },
    },
  });

  if (!user) return null;
  const scopedCreatedBefore = ordinaryCreatedBefore ?? emptyCreatedBefore;
  // 구형 일괄 정리 도구의 승인 목록은 새 기록집을 포함하지 않는다.
  if (scopedCreatedBefore && user._count?.journalNotebooks) return null;
  if (scopedCreatedBefore && (user.role !== "user" || user.createdAt > scopedCreatedBefore)) return null;
  if (emptyCreatedBefore && (user.role !== "user" || user.createdAt > emptyCreatedBefore || user.journalEntries.length || user.journalBooks.length)) return null;
  let replayReceipt = replay || scopedCreatedBefore ? null : await preparePrivacyReplayReceipt("account_deleted", userId);

  const accountEmails = Array.from(
    new Set(
      user.authIdentities
        .flatMap((identity) => identity.email ? [identity.email] : [])
        .map((email) => email.trim().toLowerCase()),
    ),
  );
  const journalEntryIds = user.journalEntries.map((entry) => entry.id);
  const failedImageDeletions: string[] = [];
  const retainedModerationSubjectKey = createHash("sha256")
    .update(`deleted-moderation-subject:${randomUUID()}`)
    .digest("hex");

  const deleteAssets = async () => {
    for (const entry of user.journalEntries) {
      try {
        await deleteStoredJournalImage(entry.image);
      } catch {
        if (entry.image) failedImageDeletions.push(entry.image);
      }
    }

    for (const book of user.journalBooks) {
      try {
        await deleteStoredJournalBook(book.objectKey);
      } catch {
        failedImageDeletions.push(book.objectKey);
      }
    }

    if ((requireCompleteImageDeletion || privacyReplayEnabled()) && failedImageDeletions.length > 0) {
      throw new Error("계정 이미지 전체를 삭제하지 못했습니다.");
    }
  };
  if (!scopedCreatedBefore) await deleteAssets();

  const appleRefreshTokens = user.authIdentities.flatMap((identity) =>
    identity.provider === "apple" &&
    identity.providerRefreshTokenEncrypted
      ? [identity.providerRefreshTokenEncrypted]
      : [],
  );
  const revokeApple = async () => {
    if (replay || appleRefreshTokens.length === 0) return;
    const appleConfiguration = {
      clientId: getRequiredAuthEnv("APPLE_CLIENT_ID"),
      teamId: getRequiredAuthEnv("APPLE_TEAM_ID"),
      keyId: getRequiredAuthEnv("APPLE_KEY_ID"),
      privateKey: getRequiredAuthEnv("APPLE_PRIVATE_KEY"),
      encryptionKey: getRequiredAuthEnv("APPLE_TOKEN_ENCRYPTION_KEY"),
    };
    for (const encryptedToken of appleRefreshTokens) {
      await revokeAppleRefreshToken(encryptedToken, appleConfiguration);
    }
  };
  if (!scopedCreatedBefore) await revokeApple();

  const deleted = await prisma.$transaction(async (transaction) => {
    await lockLocationSubject(transaction, userId);
    if (ordinaryCreatedBefore) {
      // 기존 기록의 수정도 자산 삭제와 경합하지 않게 부모 다음에 잠근다.
      await transaction.$queryRaw`SELECT "id" FROM "journal_entries" WHERE "owner_id" = ${userId} ORDER BY "id" FOR UPDATE`;
      await transaction.$queryRaw`SELECT "id" FROM "journal_books" WHERE "owner_id" = ${userId} ORDER BY "id" FOR UPDATE`;
    }
    if (scopedCreatedBefore) {
      const current = await transaction.user.findUnique({ where: { id: userId }, select: {
        role: true, createdAt: true, _count: { select: { journalEntries: true, journalBooks: true, journalNotebooks: true } },
        ...(ordinaryCreatedBefore ? { journalEntries: { select: { id: true, image: true } }, journalBooks: { select: { objectKey: true } }, authIdentities: { select: { email: true, provider: true, providerRefreshTokenEncrypted: true } } } : {}),
      } });
      if (!current || current.role !== "user" || current.createdAt > scopedCreatedBefore || current._count.journalNotebooks ||
          (emptyCreatedBefore && (current._count.journalEntries || current._count.journalBooks))) return false;
      if (ordinaryCreatedBefore) {
        const snapshot = (value: unknown) => JSON.stringify(value, (_key, item) => Array.isArray(item) ? [...item].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) : item);
        if (snapshot(current.journalEntries) !== snapshot(user.journalEntries) || snapshot(current.journalBooks) !== snapshot(user.journalBooks) || snapshot(current.authIdentities) !== snapshot(user.authIdentities)) return false;
      }
      // 사용자 행 잠금은 새 기록/기록집의 FK 삽입과도 경합한다. 재검사 후에만
      // 삭제 원장을 준비하고, DB 커밋이 끝난 뒤 완료 영수증을 남긴다.
      replayReceipt = await preparePrivacyReplayReceipt("account_deleted", userId);
      await deleteAssets();
      await revokeApple();
    }
    if (process.env.LEGAL_RIGHTS_WORKFLOW_ENABLED === "true") {
      await transaction.journalRightsNotice.updateMany({
        where: { recipientUserId: userId },
        data: { recipientUserId: null, recipientEmail: null },
      });
    }
    await transaction.journalShareTrace.deleteMany({
      where: {
        OR: [
          { originUserId: userId },
          { resolvedUserId: userId },
          ...(journalEntryIds.length > 0
            ? [{ entryId: { in: journalEntryIds } }]
            : []),
        ],
      },
    });
    await transaction.contentReport.updateMany({
      where: { reporterUserId: userId },
      data: { reporterUserId: retainedModerationSubjectKey },
    });
    await transaction.contentReport.updateMany({
      where: { targetOwnerId: userId },
      data: {
        targetOwnerId: retainedModerationSubjectKey,
        entryId: null,
      },
    });
    await transaction.contentReport.updateMany({
      where: { reviewerUserId: userId },
      data: { reviewerUserId: null },
    });
    if (journalEntryIds.length > 0) {
      await transaction.contentReport.updateMany({
        where: { entryId: { in: journalEntryIds } },
        data: { entryId: null },
      });
    }
    await transaction.customerInquiry.deleteMany({
      where: {
        OR: [
          { requesterUserId: userId },
          { handledByUserId: userId },
          ...(!scopedCreatedBefore && accountEmails.length > 0
            ? [{ requesterEmail: { in: accountEmails } }]
            : []),
        ],
      },
    });
    // 일괄 빈 계정 정리는 이메일만 같은 다른 계정의 문의·인증 자료를 건드리지 않는다.
    // 계정 식별자로 연결되지 않은 자료는 기존 보존기간 정리 경로에 맡긴다.
    if (!scopedCreatedBefore && accountEmails.length > 0) {
      await transaction.emailVerificationCode.deleteMany({
        where: { email: { in: accountEmails } },
      });
    }
    await transaction.systemLog.updateMany({
      where: {
        category: { in: ["moderation", "report"] },
        actorUserId: userId,
      },
      data: { actorUserId: null },
    });
    await transaction.systemLog.updateMany({
      where: {
        category: { in: ["moderation", "report"] },
        targetType: "user",
        targetId: userId,
      },
      data: { targetId: retainedModerationSubjectKey },
    });
    await transaction.systemLog.deleteMany({
      where: {
        category: { notIn: ["moderation", "report"] },
        // 법정 접근 증거는 계정 삭제와 분리한다. 구버전에서 남긴 원본도 보존한다.
        NOT: LEGACY_ADMIN_JOURNAL_ACCESS_AUDIT,
        OR: [
          { actorUserId: userId },
          { targetId: userId },
        ],
      },
    });

    // adminJournalAccessAudit는 User FK가 없으며 이 경로에서 삭제·대체하지 않는다.

    // 계정 삭제는 위치 이용 종료·전부 철회로 처리한다.
    await transaction.locationUsageLog.deleteMany({
      where: { userId },
    });
    await transaction.locationConsentEvent.deleteMany({
      where: { userId },
    });
    await transaction.pushDelivery.deleteMany({ where: { userId } });
    await transaction.user.delete({ where: { id: userId } });
    if (permissionAudit) {
      await transaction.locationSecurityAuditEvent.create({
        data: permissionAudit,
      });
    }
    return true;
  }, scopedCreatedBefore ? { timeout: ordinaryCreatedBefore ? 120_000 : 30_000 } : undefined);

  if (!deleted) return null;

  await commitPrivacyReplayReceipt(replayReceipt);

  return {
    id: user.id,
    role: user.role,
    deletedJournalCount: user.journalEntries.length,
    failedImageDeletionCount: failedImageDeletions.length,
    revokedAppleIdentityCount: replay ? 0 : appleRefreshTokens.length,
  };
}
