import { prisma } from "@/server/db/prisma";
import { isStoredJournalImage } from "@/server/journal/imageStorage";
import type { PublicJournalEntry } from "@/shared/api/journal";

export async function getPublicJournalEntry(
  publicId: string,
): Promise<PublicJournalEntry | null> {
  if (!isValidPublicId(publicId)) return null;

  const entry = await prisma.journalEntry.findFirst({
    where: {
      publicId,
      publishedAt: { not: null },
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
    },
  });

  if (!entry?.publicId || !entry.publishedAt) return null;

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

export async function getPublicJournalImage(publicId: string) {
  if (!isValidPublicId(publicId)) return null;

  const entry = await prisma.journalEntry.findFirst({
    where: {
      publicId,
      publishedAt: { not: null },
    },
    select: { image: true },
  });

  return entry?.image && isStoredJournalImage(entry.image)
    ? entry.image
    : null;
}

function serializePublicImage(
  image: string | null,
  publicId: string,
) {
  if (!image || image.startsWith("data:")) return null;

  return isStoredJournalImage(image)
    ? `/api/public/journal-entry-images/${encodeURIComponent(publicId)}`
    : image;
}

function isValidPublicId(publicId: string) {
  return /^[A-Za-z0-9_-]{32}$/.test(publicId);
}
