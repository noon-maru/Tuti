import { randomUUID } from "node:crypto";
import { prisma } from "@/server/db/prisma";
import { AccountAuthError } from "@/server/auth/session";

type MergeIdentityUpdate = {
  identityId: string;
  email?: string;
  providerRefreshTokenEncrypted?: string;
};

export async function mergeUserIntoCurrentAccount({
  sourceUserId,
  targetUserId,
  emailChallengeId,
  oauthAuthorizationId,
  identityUpdate,
}: {
  sourceUserId: string;
  targetUserId: string;
  emailChallengeId?: string;
  oauthAuthorizationId?: string;
  identityUpdate?: MergeIdentityUpdate;
}) {
  if (sourceUserId === targetUserId) return;

  const [sourceUser, targetUser] = await Promise.all([
    prisma.user.findUnique({
      where: { id: sourceUserId },
      select: {
        role: true,
        journalPublicationRestrictedAt: true,
        journalPublicationRestrictionReason: true,
        journalPublicationRestrictedByUserId: true,
      },
    }),
    prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        role: true,
        journalPublicationRestrictedAt: true,
        journalPublicationRestrictedByUserId: true,
      },
    }),
  ]);

  if (!sourceUser || !targetUser) {
    throw new AccountAuthError(
      "병합할 계정을 확인하지 못했어요.",
      "account_merge_target_missing",
      404,
    );
  }

  if (sourceUser.role === "admin" || targetUser.role === "admin") {
    throw new AccountAuthError(
      "관리자 계정은 다른 계정과 병합할 수 없어요.",
      "admin_account_merge_forbidden",
      409,
    );
  }

  const mergedAccountPublicationRestricted = Boolean(
    sourceUser.journalPublicationRestrictedAt ||
      targetUser.journalPublicationRestrictedAt,
  );
  const restrictionReviewerUserId =
    targetUser.journalPublicationRestrictedByUserId ??
    sourceUser.journalPublicationRestrictedByUserId;

  await prisma.$transaction(async (transaction) => {
    if (
      sourceUser.journalPublicationRestrictedAt &&
      !targetUser.journalPublicationRestrictedAt
    ) {
      await transaction.user.updateMany({
        where: {
          id: targetUserId,
          journalPublicationRestrictedAt: null,
        },
        data: {
          journalPublicationRestrictedAt:
            sourceUser.journalPublicationRestrictedAt,
          journalPublicationRestrictionReason:
            sourceUser.journalPublicationRestrictionReason,
          journalPublicationRestrictedByUserId:
            sourceUser.journalPublicationRestrictedByUserId,
        },
      });
    }

    if (identityUpdate) {
      await transaction.authIdentity.update({
        where: { id: identityUpdate.identityId },
        data: {
          ...(identityUpdate.email ? { email: identityUpdate.email } : {}),
          ...(identityUpdate.providerRefreshTokenEncrypted
            ? {
                providerRefreshTokenEncrypted:
                  identityUpdate.providerRefreshTokenEncrypted,
              }
            : {}),
        },
      });
    }

    if (emailChallengeId) {
      await transaction.emailVerificationCode.update({
        where: { id: emailChallengeId },
        data: { consumedAt: new Date() },
      });
    }

    if (oauthAuthorizationId) {
      await transaction.oAuthAuthorization.delete({
        where: { id: oauthAuthorizationId },
      });
    }

    await transaction.journalEntry.updateMany({
      where: { ownerId: sourceUserId },
      data: { ownerId: targetUserId },
    });
    const hiddenJournalEntries = mergedAccountPublicationRestricted
      ? await transaction.journalEntry.updateMany({
          where: {
            ownerId: targetUserId,
            publicationStatus: { in: ["pending", "published"] },
          },
          data: {
            publicationStatus: "hidden",
            publicationStatusChangedAt: new Date(),
            publicationReviewedAt: new Date(),
            publicationReviewerUserId: restrictionReviewerUserId,
          },
        })
      : { count: 0 };
    await transaction.journalShareTrace.updateMany({
      where: { originUserId: sourceUserId },
      data: { originUserId: targetUserId },
    });
    await transaction.journalShareTrace.updateMany({
      where: { resolvedUserId: sourceUserId },
      data: { resolvedUserId: targetUserId },
    });
    await transaction.contentReport.updateMany({
      where: { reporterUserId: sourceUserId },
      data: { reporterUserId: targetUserId },
    });
    const sourceAuthorBlocks = await transaction.journalAuthorBlock.findMany({
      where: {
        OR: [
          { blockerUserId: sourceUserId },
          { blockedUserId: sourceUserId },
        ],
      },
      select: {
        blockerUserId: true,
        blockedUserId: true,
      },
    });
    for (const block of sourceAuthorBlocks) {
      const blockerUserId =
        block.blockerUserId === sourceUserId
          ? targetUserId
          : block.blockerUserId;
      const blockedUserId =
        block.blockedUserId === sourceUserId
          ? targetUserId
          : block.blockedUserId;

      if (blockerUserId === blockedUserId) continue;

      await transaction.journalAuthorBlock.upsert({
        where: {
          blockerUserId_blockedUserId: {
            blockerUserId,
            blockedUserId,
          },
        },
        create: { blockerUserId, blockedUserId },
        update: {},
      });
    }
    await transaction.journalAuthorBlock.deleteMany({
      where: {
        OR: [
          { blockerUserId: sourceUserId },
          { blockedUserId: sourceUserId },
        ],
      },
    });
    await transaction.contentReport.updateMany({
      where: { targetOwnerId: sourceUserId },
      data: { targetOwnerId: targetUserId },
    });
    await transaction.contentReport.updateMany({
      where: { reviewerUserId: sourceUserId },
      data: { reviewerUserId: targetUserId },
    });
    await transaction.customerInquiry.updateMany({
      where: { requesterUserId: sourceUserId },
      data: { requesterUserId: targetUserId },
    });
    await transaction.customerInquiry.updateMany({
      where: { handledByUserId: sourceUserId },
      data: { handledByUserId: targetUserId },
    });
    await transaction.recommendationAction.updateMany({
      where: { userId: sourceUserId },
      data: { userId: targetUserId },
    });
    await transaction.recommendationRun.updateMany({
      where: { userId: sourceUserId },
      data: { userId: targetUserId },
    });
    await transaction.locationConsentEvent.updateMany({
      where: { userId: sourceUserId },
      data: { userId: targetUserId },
    });
    await transaction.locationUsageLog.updateMany({
      where: { userId: sourceUserId },
      data: { userId: targetUserId },
    });
    await transaction.pushDevice.updateMany({
      where: { userId: sourceUserId },
      data: { userId: targetUserId },
    });
    await transaction.pushDelivery.updateMany({
      where: { userId: sourceUserId },
      data: { userId: targetUserId },
    });
    await transaction.authIdentity.updateMany({
      where: { userId: sourceUserId },
      data: { userId: targetUserId },
    });

    await transaction.userSignalProfile.deleteMany({
      where: { userId: { in: [sourceUserId, targetUserId] } },
    });
    await transaction.userSession.deleteMany({
      where: { userId: sourceUserId },
    });
    await transaction.oAuthAuthorization.deleteMany({
      where: { userId: sourceUserId },
    });
    await transaction.systemLog.create({
      data: {
        id: randomUUID(),
        category: "account",
        action: "account.merged",
        message: "사용자가 인증을 완료하여 두 로그인 계정을 병합했습니다.",
        actorUserId: targetUserId,
        targetType: "user",
        targetId: sourceUserId,
        metadata: {
          journalPublicationRestrictionInherited:
            mergedAccountPublicationRestricted,
          hiddenJournalEntryCount: hiddenJournalEntries.count,
        },
      },
    });
    await transaction.user.delete({ where: { id: sourceUserId } });
  });
}
