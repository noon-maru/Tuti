import type { TutiJournalEntry } from "@/shared/api/journal";

export function journalCardPreview(entry: Pick<TutiJournalEntry, "title" | "content" | "placeName">) {
  const title = entry.title.trim();
  const place = entry.placeName.trim();
  const knownPlace = place && place !== "남긴 공간" ? place : "";
  const excerpt = Array.from(entry.content.trim().replace(/\s+/g, " ")).slice(0, 180).join("");
  const heading = title || knownPlace || (excerpt ? "" : "남겨둔 이야기");
  return { heading, excerpt, place: knownPlace && knownPlace !== heading ? knownPlace : null };
}
