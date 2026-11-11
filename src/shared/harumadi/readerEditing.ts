import type { Harumadi } from "../api/harumadi";
import type { TutiJournalEntry } from "../api/journal";

export function editableReaderEntry(book: Harumadi, entries: TutiJournalEntry[], entryId: string | undefined, viewerId?: string) {
  if (!viewerId || !entryId) return null;
  const entry = entries.find(item => item.id === entryId);
  if (!entry || (book.shared ? entry.authorId !== viewerId : book.role === "contributor")) return null;
  return entry.id;
}
