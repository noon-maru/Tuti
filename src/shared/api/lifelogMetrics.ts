export type LifelogStock = {
  accounts: number; writers: number; madis: number; withPhoto: number; textOnly: number; unfiled: number;
  books: number; emptyBooks: number; filledBooks: number; meanEntries: number; medianEntries: number; p90Entries: number;
  sharedBooks: number; collaborativeBooks: number; participants: number; comments: number;
  pdfs: number; pdfOwners: number; pdfPages: number;
};
export type LifelogMetricsResponse = {
  asOf: string; period: { days: number; start: string; end: string }; stock: LifelogStock;
  observation: "current-surviving-data"; activity: LifelogActivity | null;
};
export type LifelogActivity = {
  retainedSince: string | null; writerUsers: number; newMadis: number; repeatWriters30d: number;
  updatedBooks: number; activeCollaborativeBooks: number;
  invites: number; acceptedInvites: number; matureInvites: number; matureAccepted: number;
  contributors: number; firstContributors: number; pdfs: number; exporters: number; purchaseViewers: number; purchaseClickers: number;
  activation: { eligible: number; pending: number; converted: number; medianMinutes: number | null; rate: number | null };
  cohorts: Array<{ week: string; users: number; w1: number | null; w4: number | null }>;
  paths: Array<{ source: string; entrants: number; starters: number; successes: number }>;
  daily: Array<{ day: string; writers: number; madis: number }>;
};
