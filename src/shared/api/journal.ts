export type TutiJournalEntry = {
  id: string;
  title: string;
  content: string;
  image: string | null;
  crowd: string;
  placeName: string;
  difficulty: string;
  visitedAt: string;
};

export type JournalEntryInput = Pick<
  TutiJournalEntry,
  "content" | "crowd" | "difficulty" | "image" | "placeName" | "title"
> & {
  visitedAt?: string;
};

export type JournalEntriesResponse = {
  entries: TutiJournalEntry[];
};

export type JournalEntryResponse = {
  entry: TutiJournalEntry;
};

export type DeleteJournalEntryResponse = {
  entryId: string;
};
