import { createHash, randomUUID } from "node:crypto";
import { deleteStoredJournalImage } from "@/server/journal/imageStorage";
import { prisma } from "@/server/db/prisma";
import type { LocationSecurityAuditData } from "@/server/location/securityAudit";
import { getRequiredAuthEnv } from "@/server/auth/config";
import { revokeAppleRefreshToken } from "@/server/auth/appleOAuth";

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

async function deleteUserRecord(
  userId: string,
  {
    permissionAudit,
    requireCompleteImageDeletion,
  }: {
    permissionAudit?: LocationSecurityAuditData;
    requireCompleteImageDeletion: boolean;
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
    },
  });

  if (!user) return null;

  const accountEmails = Array.from(
    new Set(
      user.authIdentities
        .flatMap((identity) => identity.email ? [identity.email] : [])
        .map((email) => email.trim().toLowerCase()),
    ),
  );
  const journalEntryIds = user.journalEntries.map((entry) => entry.id);
  const failedImageDeletions: string[] = [];

  for (const entry of user.journalEntries) {
    try {
      await deleteStoredJournalImage(entry.image);
    } catch {
      if (entry.image) failedImageDeletions.push(entry.image);
    }
  }

  if (requireCompleteImageDeletion && failedImageDeletions.length > 0) {
    throw new Error("계정 이미지 전체를 삭제하지 못했습니다.");
  }

  const appleRefreshTokens = user.authIdentities.flatMap((identity) =>
    identity.provider === "apple" &&
    identity.providerRefreshTokenEncrypted
      ? [identity.providerRefreshTokenEncrypted]
      : [],
  );
  if (appleRefreshTokens.length > 0) {
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
    await transaction.contentReport.deleteMany({
      where: {
        OR: [
          { reporterUserId: userId },
          { targetOwnerId: userId },
          { reviewerUserId: userId },
          ...(journalEntryIds.length > 0
            ? [{ entryId: { in: journalEntryIds } }]
            : []),
        ],
      },
    });
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
    await transaction.systemLog.deleteMany({
      where: {
        OR: [
          { actorUserId: userId },
          { targetId: userId },
        ],
      },
    });

    // 법정 보존 대상 위치 이용 기록은 원래 사용자 식별자와의 연결만 끊는다.
    // 같은 삭제 건의 동의·이용 기록끼리만 연결되도록 임의 키로 교체한다.
    const retainedLocationSubjectKey = createHash("sha256")
      .update(`deleted-location-subject:${randomUUID()}`)
      .digest("hex");
    await transaction.locationUsageLog.updateMany({
      where: { userId },
      data: {
        userId: null,
        subjectKey: retainedLocationSubjectKey,
      },
    });
    await transaction.locationConsentEvent.updateMany({
      where: { userId },
      data: {
        userId: null,
        subjectKey: retainedLocationSubjectKey,
      },
    });
    await transaction.user.delete({ where: { id: userId } });
    if (permissionAudit) {
      await transaction.locationSecurityAuditEvent.create({
        data: permissionAudit,
      });
    }
  });

  return {
    id: user.id,
    role: user.role,
    deletedJournalCount: user.journalEntries.length,
    failedImageDeletionCount: failedImageDeletions.length,
    revokedAppleIdentityCount: appleRefreshTokens.length,
  };
}
