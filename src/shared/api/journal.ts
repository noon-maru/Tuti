export type TutiJournalEntry = {
  id: string;
  title: string;
  content: string;
  image: string | null;
  crowd: string;
  placeName: string;
  difficulty: string;
  visitedAt: string;
  publication: JournalPublication | null;
};

export type JournalPublication = {
  publicId: string;
  publishedAt: string;
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

export type JournalPublicationResponse = {
  entry: TutiJournalEntry;
};

export type PublicJournalEntry = Omit<
  TutiJournalEntry,
  "id" | "publication"
> & {
  publicId: string;
  publishedAt: string;
};
