import { JOURNAL_BOOK_COVER_STYLES, JOURNAL_BOOK_MAX_ENTRIES, JOURNAL_BOOK_TITLE_LIMIT, type JournalBookCoverStyle } from "./journalBook";

export const NOTEBOOK_INNER_STYLES = ["photo", "text"] as const;
export type NotebookInnerStyle = typeof NOTEBOOK_INNER_STYLES[number];
export type NotebookSettings = {
  title: string;
  coverStyle: JournalBookCoverStyle;
  innerStyle: NotebookInnerStyle;
  freeformNonSensitiveConfirmed?: boolean;
};
export type JournalNotebook = NotebookSettings & {
  id: string;
  revision: number;
  entryIds: string[];
  createdAt: string;
  updatedAt: string;
};
export type NotebookUpdate = NotebookSettings & { revision: number; entryIds: string[] };
export type NotebookList = { notebooks: JournalNotebook[]; nextCursor: string | null; recordCount?: number };

export function parseNotebookSettings(value: unknown): NotebookSettings | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (typeof input.title !== "string" || !input.title.trim() || input.title.length > JOURNAL_BOOK_TITLE_LIMIT ||
      !JOURNAL_BOOK_COVER_STYLES.includes(input.coverStyle as JournalBookCoverStyle) ||
      !NOTEBOOK_INNER_STYLES.includes(input.innerStyle as NotebookInnerStyle) ||
      (input.freeformNonSensitiveConfirmed !== undefined && typeof input.freeformNonSensitiveConfirmed !== "boolean")) return null;
  return { title: input.title.trim(), coverStyle: input.coverStyle as JournalBookCoverStyle, innerStyle: input.innerStyle as NotebookInnerStyle,
    ...(typeof input.freeformNonSensitiveConfirmed === "boolean" ? { freeformNonSensitiveConfirmed: input.freeformNonSensitiveConfirmed } : {}) };
}
export function parseNotebookUpdate(value: unknown): NotebookUpdate | null {
  const settings = parseNotebookSettings(value);
  if (!settings) return null;
  const input = value as Record<string, unknown>;
  if (!Number.isSafeInteger(input.revision) || (input.revision as number) < 1 ||
      !Array.isArray(input.entryIds) || input.entryIds.length > JOURNAL_BOOK_MAX_ENTRIES ||
      !input.entryIds.every(id => typeof id === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(id)) ||
      new Set(input.entryIds).size !== input.entryIds.length) return null;
  return { ...settings, revision: input.revision as number, entryIds: input.entryIds as string[] };
}
