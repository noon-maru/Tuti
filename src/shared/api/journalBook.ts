export const JOURNAL_BOOK_MAX_ENTRIES = 12;
export const JOURNAL_BOOK_TITLE_LIMIT = 80;
export const JOURNAL_BOOK_LETTER_LIMIT = 1200;

export type JournalBookInput = {
  entryIds: string[];
  title: string;
  letter: string;
  coverEntryId: string | null;
};

export type StoredJournalBook = {
  id: string;
  title: string;
  entryCount: number;
  pageCount: number;
  createdAt: string;
};

export type JournalBooksResponse = {
  books: StoredJournalBook[];
};

export type JournalBookResponse = {
  book: StoredJournalBook;
};

export type JournalBookDraft = JournalBookInput & {
  version: 1;
  step: "selection" | "details" | "preview";
  fromDate: string;
  toDate: string;
};

export function emptyJournalBookDraft(): JournalBookDraft {
  return {
    version: 1,
    step: "selection",
    entryIds: [],
    title: "우리의 작은 외출",
    letter: "",
    coverEntryId: null,
    fromDate: "",
    toDate: "",
  };
}

export function parseJournalBookInput(value: unknown): JournalBookInput | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (
    !Array.isArray(input.entryIds) ||
    input.entryIds.length < 1 ||
    input.entryIds.length > JOURNAL_BOOK_MAX_ENTRIES ||
    !input.entryIds.every(
      (id) => typeof id === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(id),
    ) ||
    new Set(input.entryIds).size !== input.entryIds.length ||
    typeof input.title !== "string" ||
    !input.title.trim() ||
    input.title.length > JOURNAL_BOOK_TITLE_LIMIT ||
    typeof input.letter !== "string" ||
    input.letter.length > JOURNAL_BOOK_LETTER_LIMIT ||
    !(
      input.coverEntryId === null ||
      (typeof input.coverEntryId === "string" &&
        input.entryIds.includes(input.coverEntryId))
    )
  )
    return null;
  return {
    entryIds: [...input.entryIds],
    title: input.title.trim(),
    letter: input.letter,
    coverEntryId: input.coverEntryId,
  };
}

export function parseJournalBookDraft(value: unknown): JournalBookDraft | null {
  if (!value || typeof value !== "object") return null;
  const draft = value as JournalBookDraft;
  if (
    typeof draft.title !== "string" ||
    draft.title.length > JOURNAL_BOOK_TITLE_LIMIT
  )
    return null;
  // Empty selections/titles are valid while editing, but not when rendering.
  const validated = parseJournalBookInput({
    ...draft,
    entryIds:
      Array.isArray(draft.entryIds) && draft.entryIds.length === 0
        ? ["draft-placeholder"]
        : draft.entryIds,
    title: draft.title.trim() === "" ? "draft-placeholder" : draft.title,
  });
  if (
    !validated ||
    draft.version !== 1 ||
    !["selection", "details", "preview"].includes(draft.step) ||
    typeof draft.fromDate !== "string" ||
    typeof draft.toDate !== "string" ||
    ![draft.fromDate, draft.toDate].every(
      (date) => date === "" || /^\d{4}-\d{2}-\d{2}$/.test(date),
    )
  )
    return null;
  return {
    ...validated,
    entryIds: [...draft.entryIds],
    title: draft.title,
    version: 1,
    step: draft.step,
    fromDate: draft.fromDate,
    toDate: draft.toDate,
  };
}

export function journalBookDate(value: string | Date) {
  return new Date(value).toLocaleDateString("sv-SE", {
    timeZone: "Asia/Seoul",
  });
}

export function createJournalBookFilename(title: string) {
  const safeTitle = title
    .normalize("NFC")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60) || "작은 기록집";
  return `Tuti_${safeTitle}.pdf`;
}
