import type { Harumadi } from "../api/harumadi";
import type { TutiJournalEntry } from "../api/journal";
import { estimateHarumadiPdfPhotoTextLines, harumadiPdfDate } from "../api/harumadiPdf";
import { HARUMADI_PDF_LAYOUT as layout } from "./pdfLayout";
import { HARUMADI_READING_TYPE as type } from "./readingTypography";

export type HarumadiReaderPage = {
  kind: "cover" | "photo" | "photo-only" | "text" | "continuation" | "back" | "empty";
  title: string; content: string; image: string | null; date: string; place: string; long?: boolean;
};

/** 브라우저 줄바꿈에 여유를 두고 원문을 자르지 않고 다음 지면으로 이어간다. */
export function splitReaderText(text: string, units: number, lines: number): string[] {
  const chunks: string[] = [];
  let chunk = "", width = 0, line = 1;
  for (const char of Array.from(text)) {
    // W 같은 넓은 영문과 탭도 좁게 추정하지 않아 종이 밖으로 넘치지 않게 한다.
    const size = char === "\t" ? 4 : char === " " ? .35 : 1;
    const wraps = char === "\n" || width + size > units;
    if (wraps && line >= lines && chunk) { chunks.push(chunk); chunk = ""; width = 0; line = 1; }
    else if (wraps) { line++; width = 0; }
    chunk += char;
    if (char !== "\n") width += size;
  }
  if (chunk || !chunks.length) chunks.push(chunk);
  return chunks;
}

export function buildHarumadiReaderPages(book: Harumadi, entries: TutiJournalEntry[], pageWidth = 320): HarumadiReaderPage[] {
  const width = Math.max(100, pageWidth), scale = width / layout.page.width, height = width * layout.page.height / layout.page.width;
  const textWidth = width - (2 * layout.page.padding + layout.shortText.frameLeft + layout.shortText.frameRight + layout.shortText.borderWidth) * scale;
  const units = Math.max(4, Math.floor(textWidth / type.body) - 1);
  const titleUnits = Math.max(4, Math.floor(textWidth / type.title) - 1);
  const metaHeight = type.meta * 1.6 * 2 + layout.shortText.captionGap * scale;
  const textSpace = height - 2 * layout.shortText.paddingVertical * scale - metaHeight;
  const bodyLines = Math.max(1, Math.floor(textSpace / (type.body * type.bodyLineHeight)) - 1);
  const sorted = [...entries].sort((a, b) => a.visitedAt.localeCompare(b.visitedAt) || a.id.localeCompare(b.id));
  const base = { title: book.title, content: "", image: null, date: "", place: "" };
  const pages: HarumadiReaderPage[] = [{ ...base, kind: "cover", image: book.coverStyle.endsWith("-image") ? sorted.find(e => e.image)?.image ?? null : null,
    date: sorted.length ? `${harumadiPdfDate(sorted[0].visitedAt).replaceAll("-", ".")}\n- ${harumadiPdfDate(sorted.at(-1)!.visitedAt).replaceAll("-", ".")}` : "아직 쓰지 않은, 우리 이야기" }];
  if (!sorted.length) pages.push({ ...base, kind: "empty" });
  for (const entry of sorted) {
    const image = entry.image;
    const data = { title: entry.title, content: entry.content, image, date: harumadiPdfDate(entry.visitedAt), place: entry.placeName };
    if (image && !entry.content.trim() && !entry.title.trim()) { pages.push({ ...data, kind: "photo-only" }); continue; }
    const long = image ? estimateHarumadiPdfPhotoTextLines(entry.content) > 7 : entry.content.trim().length > 240;
    const titleLines = Math.ceil(Array.from(entry.title).length / titleUnits);
    const titleHeight = titleLines * type.title * type.titleLineHeight + layout.shortText.titleGap * scale;
    const photoSpace = height - (layout.photo.padding + layout.photo.paddingBottom + layout.photo.lead + layout.photo.imageHeight + (long ? layout.photo.longGap : layout.photo.shortGap)) * scale - 20;
    const photoTitleHeight = titleLines * type.photoTitle * type.titleLineHeight + 8;
    // 긴 제목은 별도 지면에 보존해 본문과 사진을 밀어내지 않게 한다.
    if (entry.title && (titleLines > 2 || titleHeight > textSpace / 2 || (image && photoTitleHeight > photoSpace))) {
      const titlePageLines = Math.max(1, Math.floor(textSpace / (type.title * type.titleLineHeight)) - 1);
      for (const title of splitReaderText(entry.title, titleUnits, titlePageLines)) pages.push({ ...data, image: null, title, content: "", kind: "text" });
      data.title = "";
    }
    const firstTextLines = Math.max(1, bodyLines - (data.title ? Math.ceil(titleHeight / (type.body * type.bodyLineHeight)) : 0));
    const photoLines = Math.max(0, Math.floor((photoSpace - (data.title ? photoTitleHeight : 0)) / (type.photoBody * type.bodyLineHeight)) - 1);
    const photoUnits = Math.max(4, Math.floor((width - 2 * layout.photo.padding * scale) / type.photoBody) - 1);
    const chunks = image ? splitReaderText(entry.content, photoUnits, Math.max(1, photoLines)) : splitReaderText(entry.content, units, firstTextLines);
    pages.push({ ...data, content: image && photoLines === 0 ? "" : chunks.shift() ?? "", kind: image ? "photo" : "text", long });
    // 이어지는 쪽에서는 사진을 반복하지 않고 본문 전체를 읽도록 한다.
    for (const content of splitReaderText(chunks.join(""), units, bodyLines)) if (content) pages.push({ ...data, title: "", image: null, content, kind: "continuation" });
  }
  pages.push({ ...base, kind: "back", content: "오늘 가능한 만큼만," });
  return pages;
}
