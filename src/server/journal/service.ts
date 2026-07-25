import { prisma } from "@/server/db/prisma";
import type {
  JournalEntryInput,
  TutiJournalEntry,
} from "@/shared/api/journal";

export async function getJournalEntries(): Promise<TutiJournalEntry[]> {
  const entries = await prisma.journalEntry.findMany({
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
  input: JournalEntryInput,
): Promise<TutiJournalEntry> {
  const entry = await prisma.journalEntry.create({
    data: {
      id: crypto.randomUUID(),
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
  entryId: string,
  input: JournalEntryInput,
): Promise<TutiJournalEntry | null> {
  const existingEntry = await prisma.journalEntry.findUnique({
    where: { id: entryId },
    select: { id: true },
  });

  if (!existingEntry) return null;

  const entry = await prisma.journalEntry.update({
    where: { id: entryId },
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
    select: journalEntrySelect,
  });

  return serializeJournalEntry(entry);
}

export async function deleteJournalEntry(entryId: string) {
  const result = await prisma.journalEntry.deleteMany({
    where: { id: entryId },
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
