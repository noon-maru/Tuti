export type TutiJournalEntry = {
  id: string;
  title: string;
  content: string;
  image: string | null;
  crowd: string;
  placeId: string | null;
  placeName: string;
  theme: string;
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
  "content" | "crowd" | "difficulty" | "image" | "placeName" | "theme" | "title"
> & {
  placeId?: string | null;
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

export type JournalShareTraceIssue = {
  traceId: string;
  shortCode: string;
  issuedAt: string;
};

export type JournalShareTraceIssueResponse = {
  trace: JournalShareTraceIssue;
};

export type JournalShareTraceFinalization =
  JournalShareTraceIssue & {
    imageSha256: string;
    signature: string;
    finalizedAt: string;
  };

export type JournalShareTraceFinalizationResponse = {
  trace: JournalShareTraceFinalization;
};

export type PublicJournalEntry = Omit<
  TutiJournalEntry,
  "id" | "placeId" | "publication"
> & {
  publicId: string;
  publishedAt: string;
};
