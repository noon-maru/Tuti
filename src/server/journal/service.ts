import { prisma } from "@/server/db/prisma";
import type { TutiJournalEntry } from "@/shared/api/journal";

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

  return entries.map((entry) => ({
    ...entry,
    visitedAt: entry.visitedAt.toISOString(),
  }));
}
