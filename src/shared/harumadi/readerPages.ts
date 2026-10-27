import type { Harumadi } from "../api/harumadi";
import type { TutiJournalEntry } from "../api/journal";
import { estimateHarumadiPdfPhotoTextLines, harumadiPdfDate } from "../api/harumadiPdf";

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

export function buildHarumadiReaderPages(book: Harumadi, entries: TutiJournalEntry[]): HarumadiReaderPage[] {
  const sorted = [...entries].sort((a, b) => a.visitedAt.localeCompare(b.visitedAt) || a.id.localeCompare(b.id));
  const base = { title: book.title, content: "", image: null, date: "", place: "" };
  const pages: HarumadiReaderPage[] = [{ ...base, kind: "cover", image: book.coverStyle.endsWith("-image") ? sorted.find(e => e.image)?.image ?? null : null,
    date: sorted.length ? `${harumadiPdfDate(sorted[0].visitedAt).replaceAll("-", ".")}\n- ${harumadiPdfDate(sorted.at(-1)!.visitedAt).replaceAll("-", ".")}` : "아직 쓰지 않은, 우리 이야기" }];
  if (!sorted.length) pages.push({ ...base, kind: "empty" });
  for (const entry of sorted) {
    const image = book.innerStyle === "photo" ? entry.image : null;
    const data = { title: entry.title, content: entry.content, image, date: harumadiPdfDate(entry.visitedAt), place: entry.placeName };
    if (image && !entry.content.trim()) { pages.push({ ...data, kind: "photo-only" }); continue; }
    const long = image ? estimateHarumadiPdfPhotoTextLines(entry.content) > 7 : entry.content.trim().length > 240;
    const chunks = image ? splitReaderText(entry.content, 18, long ? 9 : 7) : splitReaderText(entry.content, 22, 10);
    pages.push({ ...data, content: chunks.shift() ?? "", kind: image ? "photo" : "text", long });
    // 이어지는 쪽에서는 사진을 반복하지 않고 본문 전체를 읽도록 한다.
    for (const content of splitReaderText(chunks.join(""), 25, 12)) if (content) pages.push({ ...data, image: null, content, kind: "continuation" });
  }
  pages.push({ ...base, kind: "back", content: "오늘 가능한 만큼만," });
  return pages;
}
