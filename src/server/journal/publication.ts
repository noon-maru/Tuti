import { prisma } from "@/server/db/prisma";
import { isStoredJournalImage } from "@/server/journal/imageStorage";
import type { PublicJournalEntry } from "@/shared/api/journal";
import { journalPublicationEnabled } from "@/shared/features/release";
import { canViewerAccessJournalEntry } from "@/server/journal/publicationState";
import { JOURNAL_PUBLICATION_POLICY_VERSION } from "@/shared/legal/journalPublicationPolicy";

export async function isPublicJournalEntryAvailable(publicId: string) {
  if (!journalPublicationEnabled || !isValidPublicId(publicId)) return false;

  return Boolean(await prisma.journalEntry.findFirst({
    where: {
      publicId,
      publicationStatus: "published",
      publishedAt: { not: null },
      publicationConsentVersion: JOURNAL_PUBLICATION_POLICY_VERSION,
      publicationConsentedAt: { not: null },
    },
    select: { id: true },
  }));
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
      publishedAt: { not: null },
      publicationStatus: "published",
      publicationConsentVersion: JOURNAL_PUBLICATION_POLICY_VERSION,
      publicationConsentedAt: { not: null },
    },
    select: {
      title: true,
      content: true,
      image: true,
      crowd: true,
      placeName: true,
      theme: true,
      difficulty: true,
      visitedAt: true,
      publicId: true,
      publishedAt: true,
      publicationStatus: true,
      ownerId: true,
    },
  });

  if (!entry?.publicId || !entry.publishedAt) return null;
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
    crowd: entry.crowd,
    placeName: entry.placeName,
    theme: entry.theme,
    difficulty: entry.difficulty,
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
      publishedAt: { not: null },
      publicationStatus: "published",
      publicationConsentVersion: JOURNAL_PUBLICATION_POLICY_VERSION,
      publicationConsentedAt: { not: null },
    },
    select: {
      image: true,
      ownerId: true,
      publicId: true,
      publishedAt: true,
      publicationStatus: true,
    },
  });

  if (!entry) return null;
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
