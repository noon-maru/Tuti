import type { Harumadi, HarumadiSettings } from "../api/harumadi";
import { LEGACY_HARUMADI_BACK_COVER_TEXT } from "./backCover";

const sameSelection = (left: string[], right: string[]) => left.length === right.length && left.every(id => right.includes(id));

export function harumadiEditsDirty(book: Harumadi | undefined, mode: string, settings: HarumadiSettings, selected: string[], ordered: string[], ownEntryIds?: string[]) {
  if (mode === "settings") return book
    ? settings.title !== book.title || settings.coverStyle !== book.coverStyle ||
      (settings.backCoverText ?? LEGACY_HARUMADI_BACK_COVER_TEXT) !== (book.backCoverText ?? LEGACY_HARUMADI_BACK_COVER_TEXT) ||
      (settings.periodStart ?? null) !== (book.periodStart ?? null) || (settings.periodEnd ?? null) !== (book.periodEnd ?? null)
    : settings.title !== "우리의 작은 하루" || settings.coverStyle !== "white-plain" || Boolean(settings.periodStart || settings.periodEnd);
  if (!book) return false;
  if (mode === "selection") return !sameSelection(selected, book.shared ? ownEntryIds ?? [] : book.entryIds);
  if (mode === "order") return ordered.join(",") !== book.entryIds.join(",");
  return false;
}
