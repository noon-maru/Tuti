import type { Harumadi } from "../api/harumadi";
import type { TutiJournalEntry } from "../api/journal";
import { harumadiPdfDate } from "../api/harumadiPdf";
import { HARUMADI_PDF_LAYOUT as layout } from "./pdfLayout";
import { HARUMADI_READING_TYPE as type } from "./readingTypography";
import { HARUMADI_READING_LAYOUT as readingLayout } from "./readingTypography";
import { readerMetaLabel, readerTextLines, takeReaderText, type ReaderTextMeasure } from "./readerText";
import { LEGACY_HARUMADI_BACK_COVER_TEXT } from "./backCover";
import { orderByEntryIds } from "./order";
import { fitHarumadiPhoto } from "./imageGeometry";

export type HarumadiReaderPage = {
  entryId?: string;
  authorName?: string;
  kind: "cover" | "photo" | "photo-only" | "text" | "continuation" | "back" | "empty";
  title: string; content: string; image: string | null; date: string; place: string; long?: boolean;
  headerHeight?: number; storyGap?: number;
  photoSize?: { width: number; height: number };
  continuation?: { title: string; image: string | null };
};

export function harumadiPageAuthor(shared: boolean | undefined, page: HarumadiReaderPage): string | null {
  if (!shared || page.kind === "cover" || page.kind === "back" || page.kind === "empty") return null;
  return page.authorName?.trim() || null;
}

/** 브라우저 줄바꿈에 여유를 두고 원문을 자르지 않고 다음 지면으로 이어간다. */
export function splitReaderText(text: string, units: number, lines: number): string[] {
  const wrapped = readerTextLines(text, units, 1), chunks: string[] = [];
  for (let index = 0; index < wrapped.length; index += Math.max(1, lines)) chunks.push(wrapped.slice(index, index + Math.max(1, lines)).join(""));
  return chunks;
}

/** 실제 읽기와 설정 미리보기가 같은 날짜·표지 사진을 선택한다. */
export function buildHarumadiCoverPage(book: Pick<Harumadi, "title" | "coverStyle"> & Partial<Pick<Harumadi, "entryIds">>, entries: TutiJournalEntry[]): HarumadiReaderPage {
  const sorted = [...entries].sort((a, b) => a.visitedAt.localeCompare(b.visitedAt) || a.id.localeCompare(b.id));
  const ordered = orderByEntryIds(sorted, book.entryIds ?? entries.map(entry => entry.id));
  return { kind: "cover", title: book.title, content: "", place: "",
    image: book.coverStyle.endsWith("-image") ? ordered.find(entry => entry.image)?.image ?? null : null,
    date: sorted.length ? `${harumadiPdfDate(sorted[0].visitedAt).replaceAll("-", ".")}\n- ${harumadiPdfDate(sorted.at(-1)!.visitedAt).replaceAll("-", ".")}` : "아직 쓰지 않은, 우리 이야기" };
}

export function buildHarumadiReaderPages(book: Harumadi, entries: TutiJournalEntry[], pageWidth = 320, measure?: ReaderTextMeasure): HarumadiReaderPage[] {
  const width = Math.max(100, pageWidth), scale = width / layout.page.width, height = width * layout.page.height / layout.page.width;
  const textWidth = width - (2 * layout.page.padding + layout.shortText.frameLeft + layout.shortText.frameRight + layout.shortText.borderWidth) * scale;
  const longWidth = width - 2 * layout.page.padding * scale;
  const metaHeight = (label: string, available: number) => Math.min(2, readerTextLines(label, available, type.meta, measure).length) * type.meta * readingLayout.continuation.metaLineHeight + layout.shortText.captionGap * scale;
  const lineCount = (space: number, size: number) => Math.max(0, Math.floor((space - readingLayout.safety + 1e-7) / (size * type.bodyLineHeight)));
  const sorted = orderByEntryIds([...entries].sort((a, b) => a.visitedAt.localeCompare(b.visitedAt) || a.id.localeCompare(b.id)), book.entryIds);
  const base = { title: book.title, content: "", image: null, date: "", place: "" };
  const pages: HarumadiReaderPage[] = [buildHarumadiCoverPage(book, sorted)];
  if (!sorted.length) pages.push({ ...base, kind: "empty" });
  for (const entry of sorted) {
    const image = entry.image;
    const data = { entryId: entry.id, title: entry.title, content: entry.content, image, date: harumadiPdfDate(entry.visitedAt), place: entry.placeName, ...(entry.authorName ? { authorName: entry.authorName } : {}) };
    let long = !image && entry.content.trim().length > 240;
    const shortSpace = height - 2 * layout.shortText.paddingVertical * scale - metaHeight(readerMetaLabel(data.date, data.place), textWidth);
    const longHeaderExtra = readingLayout.longText;
    const longSpace = height - (layout.page.padding + layout.page.paddingBottom + longHeaderExtra.headerGapPt + longHeaderExtra.headerPaddingPt + longHeaderExtra.headerBorderPt) * scale - metaHeight(readerMetaLabel(data.date, data.place), longWidth);
    const textSpace = long ? longSpace : shortSpace;
    const bodyWidth = long ? longWidth : textWidth;
    const titleLines = entry.title ? readerTextLines(entry.title, bodyWidth, type.title, measure, 600).length : 0;
    const titleHeight = titleLines * type.title * type.titleLineHeight + layout.shortText.titleGap * scale;
    const photoWidth = width - 2 * layout.photo.padding * scale;
    const placeWidth = photoWidth * .6 - (layout.photo.placeMarkSize + layout.photo.placeMarkGap) * scale;
    const placeLines = entry.placeName ? Math.min(readingLayout.photo.metaLines, readerTextLines(entry.placeName, placeWidth, type.meta, measure).length) : 0;
    const headerHeight = Math.max(readingLayout.headerHeight, placeLines * type.meta * readingLayout.photo.metaLineHeight);
    if (image && !entry.content.trim() && !entry.title.trim()) {
      const photoSize = fitHarumadiPhoto(entry, photoWidth / scale, (height - (layout.photo.padding + layout.photo.paddingBottom) * scale - headerHeight - readingLayout.safety) / scale);
      pages.push({ ...data, kind: "photo-only", headerHeight, photoSize }); continue;
    }
    const photoSize = fitHarumadiPhoto(entry, photoWidth / scale, layout.photo.maxStoryImageHeight);
    const photoTitleLines = entry.title ? readerTextLines(entry.title, photoWidth, type.photoTitle, measure, 600).length : 0;
    const photoTitleHeight = photoTitleLines * type.photoTitle * type.titleLineHeight + readingLayout.copyGap;
    const photoSpace = (gap: number) => height - (layout.photo.padding + layout.photo.paddingBottom + layout.photo.lead + photoSize.height) * scale - headerHeight - gap;
    // 긴 제목은 별도 지면에 보존해 본문과 사진을 밀어내지 않게 한다.
    if (entry.title && ((image ? photoTitleLines : titleLines) > 2 || (!image && titleHeight > textSpace / 2) || (image && photoTitleHeight > photoSpace(readingLayout.photo.longGap)))) {
      const titlePageLines = Math.max(1, Math.floor(shortSpace / (type.title * type.titleLineHeight)) - 1);
      const wrapped = readerTextLines(entry.title, textWidth, type.title, measure, 600);
      for (let index = 0; index < wrapped.length; index += titlePageLines) pages.push({ ...data, image: null, title: wrapped.slice(index, index + titlePageLines).join(""), content: "", kind: "text" });
      data.title = "";
    }
    const photoLines = (gap: number) => lineCount(photoSpace(gap) - (data.title ? photoTitleHeight : 0), type.photoBody);
    // Use the same screen-pixel gap in layout and pagination; recover only the space needed.
    const photoCopyHeight = image ? (data.title ? photoTitleHeight : 0) + (entry.content ? readerTextLines(entry.content, photoWidth, type.photoBody, measure).length * type.photoBody * type.bodyLineHeight : 0) : 0;
    const storyGap = Math.max(readingLayout.photo.longGap, Math.min(readingLayout.photo.shortGap, photoSpace(0) - photoCopyHeight - readingLayout.safety));
    if (image) long = storyGap < readingLayout.photo.shortGap;
    const firstLines = image ? photoLines(storyGap) : Math.max(1, lineCount(textSpace - (data.title ? titleHeight : 0), type.body));
    const [first, remaining] = takeReaderText(entry.content, image ? photoWidth : bodyWidth, image ? type.photoBody : type.body, firstLines, measure);
    pages.push({ ...data, content: first, kind: image ? "photo" : "text", long, ...(image ? { headerHeight, storyGap, photoSize } : {}) });
    // Continuations identify the original madi, not a disconnected fragment of text.
    const continued = readingLayout.continuation;
    const continuedWidth = width - 2 * layout.page.padding * scale;
    const continuedTitleWidth = continuedWidth - (image ? continued.photoWidth + continued.gap : 0);
    const continuedTitleLines = Math.min(continued.titleLines, readerTextLines(entry.title || "남긴 하루", continuedTitleWidth, type.photoTitle, measure, 600).length);
    const continuedMeta = [data.date.replaceAll("-", "."), data.place, "이어서"].filter(Boolean).join(" · ");
    const continuedMetaLines = Math.min(2, readerTextLines(continuedMeta, continuedTitleWidth, type.meta, measure).length);
    const continuedHeaderHeight = Math.max(image ? continued.photoHeight : 0, continuedMetaLines * type.meta * continued.metaLineHeight + continued.metaGap + continuedTitleLines * type.photoTitle * type.titleLineHeight);
    const continuedLines = Math.max(1, lineCount(height - (layout.page.padding + layout.page.paddingBottom) * scale - continuedHeaderHeight - continued.bottomGap, type.body));
    let rest = remaining;
    while (rest) {
      const [content, next] = takeReaderText(rest, continuedWidth, type.body, continuedLines, measure);
      pages.push({ ...data, title: "", image: null, content, kind: "continuation", continuation: { title: entry.title || "남긴 하루", image } });
      rest = next;
    }
  }
  pages.push({ ...base, kind: "back", content: book.backCoverText ?? LEGACY_HARUMADI_BACK_COVER_TEXT });
  return pages;
}
