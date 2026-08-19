import { deleteStoredJournalImage } from "@/server/journal/imageStorage";
import { prisma } from "@/server/db/prisma";
import type { LocationSecurityAuditData } from "@/server/location/securityAudit";
import { getRequiredAuthEnv } from "@/server/auth/config";
import { revokeAppleRefreshToken } from "@/server/auth/appleOAuth";

export async function forceDeleteUser(
  userId: string,
  permissionAudit?: LocationSecurityAuditData,
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      authIdentities: {
        select: {
          provider: true,
          providerRefreshTokenEncrypted: true,
        },
      },
      journalEntries: {
        select: {
          image: true,
        },
      },
    },
  });

  if (!user) return null;

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
    await transaction.customerInquiry.updateMany({
      where: { requesterUserId: userId },
      data: {
        requesterUserId: null,
        requesterEmail: null,
      },
    });
    await transaction.user.delete({ where: { id: userId } });
    if (permissionAudit) {
      await transaction.locationSecurityAuditEvent.create({
        data: permissionAudit,
      });
    }
  });

  const failedImageDeletions: string[] = [];

  for (const entry of user.journalEntries) {
    try {
      await deleteStoredJournalImage(entry.image);
    } catch {
      if (entry.image) failedImageDeletions.push(entry.image);
    }
  }

  return {
    id: user.id,
    role: user.role,
    deletedJournalCount: user.journalEntries.length,
    failedImageDeletionCount: failedImageDeletions.length,
    revokedAppleIdentityCount: appleRefreshTokens.length,
  };
}
