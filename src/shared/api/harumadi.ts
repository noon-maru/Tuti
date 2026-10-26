import { HARUMADI_PDF_COVER_STYLES, HARUMADI_PDF_MAX_ENTRIES, HARUMADI_PDF_TITLE_LIMIT, type HarumadiPdfCoverStyle } from "./harumadiPdf";

export const HARUMADI_INNER_STYLES = ["photo", "text"] as const;
export type HarumadiInnerStyle = typeof HARUMADI_INNER_STYLES[number];
export type HarumadiSettings = {
  title: string;
  coverStyle: HarumadiPdfCoverStyle;
  innerStyle: HarumadiInnerStyle;
  freeformNonSensitiveConfirmed?: boolean;
};
export type Harumadi = HarumadiSettings & {
  id: string;
  revision: number;
  entryIds: string[];
  createdAt: string;
  updatedAt: string;
};
export type HarumadiUpdate = HarumadiSettings & { revision: number; entryIds: string[] };
export type HarumadiList = { harumadis: Harumadi[]; nextCursor: string | null; recordCount?: number };

export function parseHarumadiSettings(value: unknown): HarumadiSettings | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (typeof input.title !== "string" || !input.title.trim() || input.title.length > HARUMADI_PDF_TITLE_LIMIT ||
      !HARUMADI_PDF_COVER_STYLES.includes(input.coverStyle as HarumadiPdfCoverStyle) ||
      !HARUMADI_INNER_STYLES.includes(input.innerStyle as HarumadiInnerStyle) ||
      (input.freeformNonSensitiveConfirmed !== undefined && typeof input.freeformNonSensitiveConfirmed !== "boolean")) return null;
  return { title: input.title.trim(), coverStyle: input.coverStyle as HarumadiPdfCoverStyle, innerStyle: input.innerStyle as HarumadiInnerStyle,
    ...(typeof input.freeformNonSensitiveConfirmed === "boolean" ? { freeformNonSensitiveConfirmed: input.freeformNonSensitiveConfirmed } : {}) };
}
export function parseHarumadiUpdate(value: unknown): HarumadiUpdate | null {
  const settings = parseHarumadiSettings(value);
  if (!settings) return null;
  const input = value as Record<string, unknown>;
  if (!Number.isSafeInteger(input.revision) || (input.revision as number) < 1 ||
      !Array.isArray(input.entryIds) || input.entryIds.length > HARUMADI_PDF_MAX_ENTRIES ||
      !input.entryIds.every(id => typeof id === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(id)) ||
      new Set(input.entryIds).size !== input.entryIds.length) return null;
  return { ...settings, revision: input.revision as number, entryIds: input.entryIds as string[] };
}
