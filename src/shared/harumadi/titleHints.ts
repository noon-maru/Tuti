import type { Harumadi } from "../api/harumadi";

export const DUPLICATE_HARUMADI_TITLE_NOTICE = "같은 이름의 하루마디가 있어요. 구분을 위해 만든 날짜 같은 보조 정보가 함께 표시돼요.";
export const normalizeHarumadiTitle = (title: string) => title.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");

export function markDuplicateHarumadiTitles<T extends { id: string; title: string }>(books: T[], visibleTitles: { id: string; title: string }[]): (T & { duplicateTitle?: boolean })[] {
  const groups = new Map<string, Set<string>>();
  for (const book of [...visibleTitles, ...books]) {
    const title = normalizeHarumadiTitle(book.title), ids = groups.get(title) ?? new Set<string>();
    ids.add(book.id); groups.set(title, ids);
  }
  return books.map(book => (groups.get(normalizeHarumadiTitle(book.title))?.size ?? 0) > 1 ? { ...book, duplicateTitle: true } : book);
}

export function harumadiTitleHint(book: Pick<Harumadi, "duplicateTitle" | "createdAt">) {
  if (!book.duplicateTitle) return null;
  const date = new Date(book.createdAt);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZone: "Asia/Seoul" }).formatToParts(date);
  const part = (name: string) => parts.find(value => value.type === name)?.value ?? "";
  return { date: `${part("year")}.${part("month")}.${part("day")}`, time: `${part("hour")}:${part("minute")}:${part("second")}` };
}

export const harumadiHintExtraHeight = (spines: boolean, rows: number) => rows * (spines ? 20 : 28);

export function harumadiAccessibleTitle(book: Pick<Harumadi, "title" | "duplicateTitle" | "createdAt" | "role" | "ownerName">) {
  const hint = harumadiTitleHint(book);
  return hint ? `${book.title}, ${hint.date} ${hint.time}에 만든 책${book.role === "contributor" && book.ownerName ? `, ${book.ownerName}님` : ""}` : book.title;
}

export function shouldNotifyDuplicateTitle(previous: Pick<Harumadi, "title"> | undefined, saved: Pick<Harumadi, "title" | "duplicateTitle">) {
  return saved.duplicateTitle === true && (!previous || normalizeHarumadiTitle(previous.title) !== normalizeHarumadiTitle(saved.title));
}
