import type { JournalEntryInput } from "./journal";

export const FIRST_JOURNAL_CONTENT_LIMIT = 4000;
export const FIRST_JOURNAL_PLACE_LIMIT = 120;

export function prepareFirstJournalDraft(input: {
  image: string | null;
  content: string;
  date: string;
  place: string;
}, today: string): JournalEntryInput | null {
  const content = input.content.trim();
  if ((!input.image && !content) || content.length > FIRST_JOURNAL_CONTENT_LIMIT || input.place.trim().length > FIRST_JOURNAL_PLACE_LIMIT) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || input.date > today) return null;
  const date = new Date(`${input.date}T12:00:00+09:00`);
  if (Number.isNaN(date.getTime()) || new Date(date.getTime() + 9 * 3600_000).toISOString().slice(0, 10) !== input.date) return null;
  return {
    title: "", content, image: input.image,
    crowd: "미정", difficulty: "미정", theme: "미정",
    placeId: null, placeName: input.place.trim() || "남긴 공간",
    visitedAt: date.toISOString(),
  };
}
