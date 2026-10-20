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
  }: {
    permissionAudit?: LocationSecurityAuditData;
    requireCompleteImageDeletion: boolean;
    replay?: boolean;
  },
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
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
    },
  });

  if (!user) return null;
  const replayReceipt = replay ? null : await preparePrivacyReplayReceipt("account_deleted", userId);

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

  const appleRefreshTokens = user.authIdentities.flatMap((identity) =>
    identity.provider === "apple" &&
    identity.providerRefreshTokenEncrypted
      ? [identity.providerRefreshTokenEncrypted]
      : [],
  );
  if (!replay && appleRefreshTokens.length > 0) {
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
  }

  await prisma.$transaction(async (transaction) => {
    await lockLocationSubject(transaction, userId);
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
          ...(accountEmails.length > 0
            ? [{ requesterEmail: { in: accountEmails } }]
            : []),
        ],
      },
    });
    if (accountEmails.length > 0) {
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
  });

  await commitPrivacyReplayReceipt(replayReceipt);

  return {
    id: user.id,
    role: user.role,
    deletedJournalCount: user.journalEntries.length,
    failedImageDeletionCount: failedImageDeletions.length,
    revokedAppleIdentityCount: replay ? 0 : appleRefreshTokens.length,
  };
}
