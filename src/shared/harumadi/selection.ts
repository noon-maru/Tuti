import type { TutiJournalEntry } from "../api/journal";
import { getKoreanDateKeyFromIso } from "@/lib/date/koreanDate";
import { filterJournalEntries } from "../tuti/journalSearch";

const dateLabel = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Seoul" });

export function groupHarumadiSelection(entries: TutiJournalEntry[], search: string) {
  const groups = new Map<string, { key: string; label: string; entries: TutiJournalEntry[] }>();
  for (const entry of filterJournalEntries(entries, search)) {
    const key = getKoreanDateKeyFromIso(entry.visitedAt) ?? "";
    if (!groups.has(key)) groups.set(key, { key, label: key ? dateLabel.format(new Date(`${key}T12:00:00+09:00`)) : "날짜 미정", entries: [] });
    groups.get(key)!.entries.push(entry);
  }
  return [...groups.values()].sort((left, right) => right.key.localeCompare(left.key));
}

export function toggleHarumadiSelection(ids: string[], id: string) {
  return ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id];
}
