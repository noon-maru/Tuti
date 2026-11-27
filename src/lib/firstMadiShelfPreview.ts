import type { QueryClient } from "@tanstack/react-query";
import type { Harumadi, HarumadiList } from "@/shared/api/harumadi";
import type { TutiJournalEntry } from "@/shared/api/journal";

export type FirstMadiShelfPreview = { book: Harumadi; entry: TutiJournalEntry; receivedAt: number };
const previewKey = (ownerId: string) => ["first-madi-shelf-preview", ownerId] as const;

export function rememberFirstMadiShelf(client: QueryClient, ownerId: string, entry: TutiJournalEntry) {
  const book = entry.firstMadiBook;
  if (entry.sensitiveContent !== false || entry.sensitiveWithdrawnAt || !book || book.shared || book.role !== "owner" ||
    book.id !== entry.savedHarumadi?.id || book.entryIds.length !== 1 || book.entryIds[0] !== entry.id) return;
  client.setQueryData<FirstMadiShelfPreview>(previewKey(ownerId), { book, entry, receivedAt: Date.now() });
}

export function readFirstMadiShelf(client: QueryClient, ownerId?: string) {
  const value = ownerId ? client.getQueryData<FirstMadiShelfPreview>(previewKey(ownerId)) : undefined;
  return value && Date.now() - value.receivedAt < 120_000 ? value : undefined;
}

/** The reader may bridge only to the exact freshly saved book and entry. */
export function readFirstMadiPage(client: QueryClient, ownerId: string, bookId: string | null, entryId: string | null) {
  if (!bookId || !entryId) return;
  const preview = readFirstMadiShelf(client, ownerId);
  if (preview?.book.id === bookId && preview.entry.id === entryId && !preview.book.shared && preview.book.entryIds.includes(entryId)) return preview;
}

export function updateFirstMadiShelf(client: QueryClient, ownerId: string, book: Harumadi) {
  const preview = readFirstMadiShelf(client, ownerId);
  if (!preview || preview.book.id !== book.id || book.shared || book.role === "contributor" || !book.entryIds.includes(preview.entry.id)) return;
  client.setQueryData<FirstMadiShelfPreview>(previewKey(ownerId), { ...preview, book, receivedAt: Date.now() });
}

export function refreshFirstMadiShelfEntry(client: QueryClient, ownerId: string, entryId: string, entry?: TutiJournalEntry) {
  const preview = readFirstMadiShelf(client, ownerId);
  if (!preview || preview.entry.id !== entryId) return;
  if (!entry || entry.sensitiveContent !== false || entry.sensitiveWithdrawnAt) client.removeQueries({ queryKey: previewKey(ownerId), exact: true });
  else client.setQueryData<FirstMadiShelfPreview>(previewKey(ownerId), { ...preview, entry });
}

/** A preview may fill the initial gap. It never becomes the complete library cache. */
export function displayFirstMadiShelf(pages: HarumadiList[] | undefined, updatedAt: number, isError: boolean, preview?: FirstMadiShelfPreview) {
  const books = pages?.flatMap(page => page.harumadis) ?? [];
  const authoritativeBook = preview ? books.find(book => book.id === preview.book.id) : undefined;
  const currentPreview = !isError && preview && (updatedAt < preview.receivedAt ||
    (authoritativeBook && !authoritativeBook.shared && authoritativeBook.entryIds.includes(preview.entry.id))) ? preview : undefined;
  if (!currentPreview || updatedAt >= currentPreview.receivedAt) return { books, preview: currentPreview };
  const existing = books.findIndex(book => book.id === currentPreview.book.id);
  if (existing < 0) return { books: [currentPreview.book, ...books], preview: currentPreview };
  books[existing] = currentPreview.book;
  return { books, preview: currentPreview };
}
