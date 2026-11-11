import type { Harumadi } from "../api/harumadi";
import type { TutiJournalEntry } from "../api/journal";

/** A complete, permission-filtered library is required; unknown is never "unfiled". */
export function unfiledMadi(entries: TutiJournalEntry[], books: Harumadi[] | undefined): TutiJournalEntry[] | null {
  if (!books) return null;
  const filed = new Set(books.flatMap(book => book.entryIds));
  return entries.filter(entry => !filed.has(entry.id));
}
