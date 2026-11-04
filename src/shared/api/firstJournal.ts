import type { JournalEntryInput } from "./journal";

export const FIRST_JOURNAL_CONTENT_LIMIT = 4000;
export const FIRST_JOURNAL_PLACE_LIMIT = 120;
export const FIRST_JOURNAL_TITLE_LIMIT = 80;

export type MadiDraftFields = {
  image: string | null;
  content: string;
  date: string;
  place: string;
  title?: string;
};
export type MadiFieldErrors = Partial<Record<"title" | "content" | "date" | "place", string>>;

export function getMadiFieldErrors(input: MadiDraftFields, today: string, allowMetadataOnly = false): MadiFieldErrors {
  const errors: MadiFieldErrors = {};
  if ((input.title?.trim().length ?? 0) > FIRST_JOURNAL_TITLE_LIMIT) errors.title = `제목은 ${FIRST_JOURNAL_TITLE_LIMIT}자까지 적을 수 있어요.`;
  if (input.content.trim().length > FIRST_JOURNAL_CONTENT_LIMIT) errors.content = `이야기는 ${FIRST_JOURNAL_CONTENT_LIMIT}자까지 적을 수 있어요.`;
  else if (!input.image && !input.content.trim() && !(allowMetadataOnly && (input.title?.trim() || input.place.trim()))) {
    errors.content = allowMetadataOnly ? "사진이나 이야기, 제목, 장소 중 하나를 남겨주세요." : "사진 없이 남기려면 이야기를 적어주세요.";
  }
  if (input.place.trim().length > FIRST_JOURNAL_PLACE_LIMIT) errors.place = `장소는 ${FIRST_JOURNAL_PLACE_LIMIT}자까지 적을 수 있어요.`;
  const date = new Date(`${input.date}T12:00:00+09:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || Number.isNaN(date.getTime()) ||
    new Date(date.getTime() + 9 * 3600_000).toISOString().slice(0, 10) !== input.date) errors.date = "올바른 날짜를 선택해주세요.";
  else if (input.date > today) errors.date = "오늘 또는 지난 날짜를 선택해주세요.";
  return errors;
}

export function prepareFirstJournalDraft(input: MadiDraftFields, today: string): JournalEntryInput | null {
  if (Object.keys(getMadiFieldErrors(input, today)).length) return null;
  const title = input.title?.trim() ?? "";
  const content = input.content.trim();
  const date = new Date(`${input.date}T12:00:00+09:00`);
  return {
    title, content, image: input.image,
    placeId: null, placeName: input.place.trim() || "남긴 공간",
    visitedAt: date.toISOString(),
  };
}
