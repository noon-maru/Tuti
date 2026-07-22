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

export type JournalEntriesResponse = {
  entries: TutiJournalEntry[];
};
