import { HARUMADI_READING_LAYOUT } from "./readingTypography";

/** CSS px, before any transform applied to the desktop app mockup. */
export type ReaderTextMeasure = (text: string, fontSize: number, weight?: number) => number;

export const readerMetaLabel = (date: string, place: string) => [date, place].filter(Boolean).join(" · ");

export const estimateReaderText: ReaderTextMeasure = (text, size) => Array.from(text).reduce((width, char) =>
  width + (char === "\t" ? 4 : char === " " ? .35 : 1) * size, 0);

/** Match pre-wrap + keep-all: wrap whole words, breaking only oversized words.
 * Keep every original character, including whitespace, for lossless pagination. */
export function readerTextLines(text: string, width: number, size: number, measure = estimateReaderText, weight = 400): string[] {
  const lines: string[] = [];
  let line = "";
  const fits = (value: string) => measure(value, size, weight) <= Math.max(1, width);
  for (const token of text.match(/\r\n|[\r\n]|[^\S\r\n]+|[^\s]+/gu) ?? []) {
    if (/^[\r\n]/.test(token)) { lines.push(line + token); line = ""; continue; }
    if (line && token.trim() && !fits(line + token)) { lines.push(line); line = ""; }
    if (fits(token)) { line += token; continue; }
    for (const char of Array.from(token)) {
      if (line && !fits(line + char)) { lines.push(line); line = ""; }
      line += char;
    }
  }
  if (line || !lines.length) lines.push(line);
  return lines;
}

export function takeReaderText(text: string, width: number, size: number, count: number, measure = estimateReaderText) {
  const first = count > 0 ? readerTextLines(text, width, size, measure).slice(0, count).join("") : "";
  return [first, text.slice(first.length)] as const;
}

export function readerPageWidth(width: number, height: number, captionSpace = 0) {
  const availableHeight = height - captionSpace;
  if (width <= 0 || availableHeight <= 0) return 0;
  return Math.max(1, Math.floor(Math.min(width, availableHeight * 419.53 / 595.28)) - 2);
}

/** Size the paper + byline stage, not the surrounding empty viewport. */
export function readerGroupGeometry(width: number, height: number, captionSpace = 0, navigationHeight = 44, gap: number = HARUMADI_READING_LAYOUT.viewer.gap) {
  const naturalHeight = Math.max(0, width) * 595.28 / 419.53 + captionSpace;
  // Center the paper, reserved byline and navigation together as one reading group.
  const minimumHeight = Math.min(Math.max(0, width), 180) * 595.28 / 419.53 + captionSpace + navigationHeight + gap;
  const availableHeight = Math.max(height, minimumHeight);
  const stageHeight = Math.max(0, Math.min(naturalHeight, availableHeight - navigationHeight - gap));
  return { stageHeight, minimumHeight, pageWidth: readerPageWidth(width, stageHeight, captionSpace) };
}
