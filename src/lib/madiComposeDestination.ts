import type { QueryClient } from "@tanstack/react-query";
import type { Harumadi, HarumadiContent, HarumadiList } from "@/shared/api/harumadi";

/** Metadata is a display hint, never proof of current write access. */
export function cachedMadiDestination(client: QueryClient, ownerId?: string, bookId?: string | null): Harumadi | undefined {
  if (!ownerId || !bookId) return;
  const library = client.getQueryState<{ pages: HarumadiList[] }>(["library-harumadis", ownerId, "all"]);
  const compose = client.getQueryState<Harumadi>(["compose-harumadi", ownerId, bookId]);
  const content = client.getQueryState<HarumadiContent>(["harumadi-content", ownerId, bookId]);
  return [
    { book: library?.data?.pages.flatMap(page => page.harumadis).find(book => book.id === bookId), at: library?.dataUpdatedAt ?? 0 },
    { book: compose?.data, at: compose?.dataUpdatedAt ?? 0 },
    { book: content?.data?.harumadi, at: content?.dataUpdatedAt ?? 0 },
  ].filter(item => item.book?.id === bookId).sort((a, b) => b.at - a.at)[0]?.book;
}

export function madiDestinationScopeChanged(initial: { shared?: boolean } | undefined, current: { shared?: boolean } | undefined) {
  return Boolean(initial && typeof initial.shared === "boolean" && current && initial.shared !== Boolean(current.shared));
}
