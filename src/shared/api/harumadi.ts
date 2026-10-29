import { HARUMADI_PDF_COVER_STYLES, HARUMADI_PDF_TITLE_LIMIT, type HarumadiPdfCoverStyle } from "./harumadiPdf";
import type { TutiJournalEntry } from "./journal";
import { isHarumadiBackCoverText } from "../harumadi/backCover";

export type HarumadiSettings = {
  title: string;
  coverStyle: HarumadiPdfCoverStyle;
  backCoverText?: string;
  freeformNonSensitiveConfirmed?: boolean;
};
export type Harumadi = HarumadiSettings & {
  togetherEnabled?: boolean;
  shared?: boolean;
  role?: "owner" | "contributor";
  ownerName?: string;
  participantCount?: number;
  id: string;
  revision: number;
  entryIds: string[];
  createdAt: string;
  updatedAt: string;
};
export type HarumadiUpdate = HarumadiSettings & { revision: number; entryIds: string[] };
export type HarumadiList = { harumadis: Harumadi[]; nextCursor: string | null; recordCount?: number };
export type HarumadiContent = {
  harumadi: Harumadi;
  entries: TutiJournalEntry[];
  version: string;
  totalRecordCount: number;
  cacheable: boolean;
};

export function parseHarumadiSettings(value: unknown): HarumadiSettings | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (typeof input.title !== "string" || !input.title.trim() || input.title.length > HARUMADI_PDF_TITLE_LIMIT ||
      !HARUMADI_PDF_COVER_STYLES.includes(input.coverStyle as HarumadiPdfCoverStyle) ||
      (input.backCoverText !== undefined && !isHarumadiBackCoverText(input.backCoverText)) ||
      (input.freeformNonSensitiveConfirmed !== undefined && typeof input.freeformNonSensitiveConfirmed !== "boolean")) return null;
  return { title: input.title.trim(), coverStyle: input.coverStyle as HarumadiPdfCoverStyle,
    ...(typeof input.backCoverText === "string" ? { backCoverText: input.backCoverText.trim() } : {}),
    ...(typeof input.freeformNonSensitiveConfirmed === "boolean" ? { freeformNonSensitiveConfirmed: input.freeformNonSensitiveConfirmed } : {}) };
}
export function parseHarumadiUpdate(value: unknown): HarumadiUpdate | null {
  const settings = parseHarumadiSettings(value);
  if (!settings) return null;
  const input = value as Record<string, unknown>;
  if (!Number.isSafeInteger(input.revision) || (input.revision as number) < 1 ||
      !Array.isArray(input.entryIds) ||
      !input.entryIds.every(id => typeof id === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(id)) ||
      new Set(input.entryIds).size !== input.entryIds.length) return null;
  return { ...settings, revision: input.revision as number, entryIds: input.entryIds as string[] };
}
