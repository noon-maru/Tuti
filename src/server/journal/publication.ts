import { prisma } from "@/server/db/prisma";
import { publicSensitiveJournalFilter } from "@/server/journal/sensitivePolicy";
import { isStoredJournalImage } from "@/server/journal/imageStorage";
import type { PublicJournalEntry } from "@/shared/api/journal";
import { journalPublicationEnabled } from "@/shared/features/release";
import { canViewerAccessJournalEntry } from "@/server/journal/publicationState";
import { getJournalPublicationPolicyVersion } from "@/shared/legal/journalPublicationPolicy";
import { isJournalLegallyBlocked } from "@/server/legal/journalRights";

export async function isPublicJournalEntryAvailable(publicId: string) {
  return (await getPublicJournalAccessState(publicId)) === "available";
}

export async function getPublicJournalAccessState(publicId: string): Promise<"available" | "unavailable" | "rights_blocked"> {
  if (!journalPublicationEnabled || !isValidPublicId(publicId)) return "unavailable";

  const entry = await prisma.journalEntry.findFirst({
    where: {
      publicId,
      ...publicSensitiveJournalFilter(),
      publicationStatus: "published",
      publishedAt: { not: null },
      publicationConsentVersion: getJournalPublicationPolicyVersion(),
      publicationConsentedAt: { not: null },
    },
    select: { id: true },
  });
  if (!entry) return "unavailable";
  return await isJournalLegallyBlocked(entry.id) ? "rights_blocked" : "available";
}

export async function getPublicJournalEntry(
  publicId: string,
  viewerUserId?: string,
): Promise<PublicJournalEntry | null> {
  if (!journalPublicationEnabled) return null;
  if (!isValidPublicId(publicId)) return null;

  const entry = await prisma.journalEntry.findFirst({
    where: {
      publicId,
      ...publicSensitiveJournalFilter(),
      publishedAt: { not: null },
      publicationStatus: "published",
      publicationConsentVersion: getJournalPublicationPolicyVersion(),
      publicationConsentedAt: { not: null },
    },
    select: {
      id: true,
      title: true,
      content: true,
      image: true,
      placeName: true,
      visitedAt: true,
      publicId: true,
      publishedAt: true,
      publicationStatus: true,
      ownerId: true,
    },
  });

  if (!entry?.publicId || !entry.publishedAt) return null;
  if (await isJournalLegallyBlocked(entry.id)) return null;
  const authorBlocked = viewerUserId
    ? await isJournalAuthorBlocked(viewerUserId, entry.ownerId)
    : false;
  if (!canViewerAccessJournalEntry(entry, authorBlocked)) {
    return null;
  }

  return {
    publicId: entry.publicId,
    publishedAt: entry.publishedAt.toISOString(),
    title: entry.title,
    content: entry.content,
    image: serializePublicImage(entry.image, entry.publicId),
    placeName: entry.placeName,
    visitedAt: entry.visitedAt.toISOString(),
  };
}

export async function getPublicJournalImage(
  publicId: string,
  viewerUserId?: string,
) {
  if (!journalPublicationEnabled) return null;
  if (!isValidPublicId(publicId)) return null;

  const entry = await prisma.journalEntry.findFirst({
    where: {
      publicId,
      ...publicSensitiveJournalFilter(),
      publishedAt: { not: null },
      publicationStatus: "published",
      publicationConsentVersion: getJournalPublicationPolicyVersion(),
      publicationConsentedAt: { not: null },
    },
    select: {
      id: true,
      image: true,
      ownerId: true,
      publicId: true,
      publishedAt: true,
      publicationStatus: true,
    },
  });

  if (!entry) return null;
  if (await isJournalLegallyBlocked(entry.id)) return null;
  const authorBlocked = viewerUserId
    ? await isJournalAuthorBlocked(viewerUserId, entry.ownerId)
    : false;
  if (!canViewerAccessJournalEntry(entry, authorBlocked)) {
    return null;
  }

  return entry?.image && isStoredJournalImage(entry.image)
    ? entry.image
    : null;
}

async function isJournalAuthorBlocked(
  viewerUserId: string,
  ownerId: string,
) {
  if (viewerUserId === ownerId) return false;

  return Boolean(await prisma.journalAuthorBlock.findUnique({
    where: {
      blockerUserId_blockedUserId: {
        blockerUserId: viewerUserId,
        blockedUserId: ownerId,
      },
    },
    select: { blockerUserId: true },
  }));
}

function serializePublicImage(
  image: string | null,
  publicId: string,
) {
  if (!image || !isStoredJournalImage(image)) return null;

  return `/api/public/journal-entry-images/${encodeURIComponent(publicId)}`;
}

function isValidPublicId(publicId: string) {
  return /^[A-Za-z0-9_-]{32}$/.test(publicId);
}
