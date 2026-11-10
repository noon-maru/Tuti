import { preferencesStorage } from "./storage/preferencesStorage";
import type { HarumadiReaderPage } from "@/shared/harumadi/readerPages";

export type ReadingPosition = { entryId: string; part: number };
export function readingPosition(pages: HarumadiReaderPage[], index: number): ReadingPosition | null {
  const entryId = pages[index]?.entryId;
  if (!entryId) return null;
  return { entryId, part: pages.slice(0, index).filter(page => page.entryId === entryId).length };
}
export function readingIndex(pages: HarumadiReaderPage[], position: ReadingPosition | null) {
  if (!position) return Math.min(1, pages.length - 1);
  const indices = pages.flatMap((page, index) => page.entryId === position.entryId ? [index] : []);
  return indices[Math.min(position.part, indices.length - 1)] ?? Math.min(1, pages.length - 1);
}
type Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<unknown>; removeItem(key: string): Promise<unknown> };
/** No prose/photos: retain up to 50 book/entry ID preferences per account for 90 days. */
export function createReadingPositions(storage: Storage, now = Date.now) {
  type Saved = ReadingPosition & { bookId: string; at: number };
  let pending: Promise<unknown> = Promise.resolve();
  const key = (owner: string) => `tuti-reading-position:${owner}`;
  const read = async (owner: string): Promise<Saved[]> => {
    try {
      const data: unknown = JSON.parse(await storage.getItem(key(owner)) ?? "[]");
      if (!Array.isArray(data)) return [];
      return data.filter((row): row is Saved => Boolean(row && typeof row.bookId === "string" && typeof row.entryId === "string" && Number.isSafeInteger(row.part) && row.part >= 0 && Number.isFinite(row.at) && row.at <= now() && row.at > now() - 90 * 86400_000)).slice(0, 50);
    } catch { return []; }
  };
  const enqueue = <T,>(fn: () => Promise<T>) => {
    const result = pending.catch(() => {}).then(fn); pending = result; return result;
  };
  return {
    load: (owner: string, bookId: string) => enqueue(async () => (await read(owner)).find(row => row.bookId === bookId) ?? null),
    save: (owner: string, bookId: string, position: ReadingPosition | null) => enqueue(async () => {
      const rows = (await read(owner)).filter(row => row.bookId !== bookId);
      if (position) rows.unshift({ ...position, bookId, at: now() });
      await storage.setItem(key(owner), JSON.stringify(rows.slice(0, 50))).catch(() => {});
    }),
    clearOwner: (owner: string) => enqueue(async () => { await storage.removeItem(key(owner)).catch(() => {}); }),
  };
}
export const harumadiReadingPositions = createReadingPositions(preferencesStorage);
