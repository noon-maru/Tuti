import type { TutiJournalEntry } from "../api/journal";
import { getKoreanDateKeyFromIso } from "@/lib/date/koreanDate";

const normalize = (value: string) => value.normalize("NFC").toLocaleLowerCase("ko-KR").trim();

/** Search the loaded collection only; never reorder or mutate source records. */
export function filterJournalEntries(entries: TutiJournalEntry[], search: string) {
  const terms = normalize(search).split(/\s+/).filter(Boolean);
  if (!terms.length) return entries;
  return entries.filter(entry => {
    const haystack = normalize([entry.title, entry.content, entry.placeName, entry.authorName ?? "", getKoreanDateKeyFromIso(entry.visitedAt) ?? ""].join(" "));
    return terms.every(term => haystack.includes(term));
  });
}
