import { prisma } from "@/server/db/prisma";
import type {
  JournalEntryInput,
  TutiJournalEntry,
} from "@/shared/api/journal";

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
      crowd: true,
      placeName: true,
      difficulty: true,
      visitedAt: true,
    },
  });

  return entries.map(serializeJournalEntry);
}

export async function createJournalEntry(
  ownerId: string,
  input: JournalEntryInput,
): Promise<TutiJournalEntry> {
  const entry = await prisma.journalEntry.create({
    data: {
      id: crypto.randomUUID(),
      ownerId,
      title: input.title,
      content: input.content,
      image: input.image,
      crowd: input.crowd,
      placeName: input.placeName,
      difficulty: input.difficulty,
      visitedAt: input.visitedAt ? new Date(input.visitedAt) : new Date(),
    },
    select: journalEntrySelect,
  });

  return serializeJournalEntry(entry);
}

export async function updateJournalEntry(
  ownerId: string,
  entryId: string,
  input: JournalEntryInput,
): Promise<TutiJournalEntry | null> {
  const result = await prisma.journalEntry.updateMany({
    where: { id: entryId, ownerId },
    data: {
      title: input.title,
      content: input.content,
      image: input.image,
      crowd: input.crowd,
      placeName: input.placeName,
      difficulty: input.difficulty,
      ...(input.visitedAt
        ? { visitedAt: new Date(input.visitedAt) }
        : {}),
    },
  });

  if (result.count === 0) return null;

  const entry = await prisma.journalEntry.findUniqueOrThrow({
    where: { id: entryId },
    select: journalEntrySelect,
  });

  return serializeJournalEntry(entry);
}

export async function deleteJournalEntry(
  ownerId: string,
  entryId: string,
) {
  const result = await prisma.journalEntry.deleteMany({
    where: { id: entryId, ownerId },
  });

  return result.count > 0;
}

const journalEntrySelect = {
  id: true,
  title: true,
  content: true,
  image: true,
  crowd: true,
  placeName: true,
  difficulty: true,
  visitedAt: true,
} as const;

function serializeJournalEntry(
  entry: Omit<TutiJournalEntry, "visitedAt"> & { visitedAt: Date },
): TutiJournalEntry {
  return {
    ...entry,
    visitedAt: entry.visitedAt.toISOString(),
  };
}
