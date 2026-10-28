import type { HarumadiContent } from "@/shared/api/harumadi";
import { preferencesStorage } from "./storage/preferencesStorage";

export const HARUMADI_CACHE_TTL = 7 * 86400_000;
export const HARUMADI_CACHE_MAX_BOOKS = 5;
export const HARUMADI_CACHE_INVALIDATED = "tuti:harumadi-cache-invalidated";
const MAX_BOOK_BYTES = 3 * 1024 * 1024;
const validId = (id: string) => /^[a-zA-Z0-9_-]{1,128}$/.test(id);
export type CacheTicket = { owner: number; book: number };
export type CachedHarumadi = { content: HarumadiContent; savedAt: number; missingImages: number };
export type ReadCacheStorage = {
  read(owner: string, file: string): Promise<string>;
  write(owner: string, file: string, data: string): Promise<void>;
  remove(owner: string, file: string): Promise<void>;
  clear(owner: string): Promise<void>;
  blocked(owner: string): Promise<boolean>;
  block(owner: string, blocked: boolean): Promise<void>;
};
type Index = { id: string; savedAt: number }[];

export function canCacheHarumadi(content: HarumadiContent) {
  return content.cacheable === true && content.entries.every(entry => entry.sensitiveContent === false && !entry.sensitiveWithdrawnAt);
}

export function createHarumadiReadCache(storage: ReadCacheStorage, now = Date.now) {
  const ownerEpoch = new Map<string, number>();
  const bookEpoch = new Map<string, number>();
  const queues = new Map<string, Promise<unknown>>();
  const ticket = (owner: string, id: string): CacheTicket => ({ owner: ownerEpoch.get(owner) ?? 0, book: bookEpoch.get(`${owner}:${id}`) ?? 0 });
  const current = (owner: string, id: string, value: CacheTicket) => {
    const next = ticket(owner, id); return next.owner === value.owner && next.book === value.book;
  };
  const enqueue = <T>(owner: string, operation: () => Promise<T>) => {
    const pending = (queues.get(owner) ?? Promise.resolve()).catch(() => {}).then(operation);
    queues.set(owner, pending); return pending;
  };
  async function index(owner: string): Promise<Index> {
    try {
      const value: unknown = JSON.parse(await storage.read(owner, "index.json"));
      if (!Array.isArray(value) || value.length > HARUMADI_CACHE_MAX_BOOKS || value.some(item => !item || !validId(item.id) || !Number.isFinite(item.savedAt))) return [];
      return value;
    } catch { return []; }
  }
  const remove = (owner: string, id: string) => storage.remove(owner, `${id}.json`).catch(() => {});
  return {
    ticket, current,
    begin(owner: string, id: string) {
      bookEpoch.set(`${owner}:${id}`, (bookEpoch.get(`${owner}:${id}`) ?? 0) + 1);
      return ticket(owner, id);
    },
    async get(owner: string, id: string, binding: string | null): Promise<CachedHarumadi | null> {
      if (!validId(owner) || !validId(id) || !binding) return null;
      const started = ticket(owner, id);
      return enqueue(owner, async () => {
        try {
          if (await storage.blocked(owner) || !current(owner, id, started)) return null;
          const books = await index(owner);
          const found = books.find(book => book.id === id);
          if (!found || now() - found.savedAt > HARUMADI_CACHE_TTL || found.savedAt > now()) { await remove(owner, id); return null; }
          const raw = await storage.read(owner, `${id}.json`);
          if (new TextEncoder().encode(raw).byteLength > MAX_BOOK_BYTES) throw new Error("oversize");
          const data = JSON.parse(raw);
          if (data.schema !== 2 || data.owner !== owner || data.binding !== binding || data.savedAt !== found.savedAt ||
            data.content?.harumadi?.id !== id || !isReadContent(data.content) || !canCacheHarumadi(data.content) ||
            !data.content.entries.every((entry: { image: string | null }) => entry.image === null || isCachedImage(entry.image)) ||
            !Number.isSafeInteger(data.missingImages) || data.missingImages < 0) throw new Error("invalid");
          return current(owner, id, started) ? { content: data.content, savedAt: data.savedAt, missingImages: data.missingImages } : null;
        } catch { await remove(owner, id); return null; }
      });
    },
    async put(owner: string, id: string, binding: string | null, content: HarumadiContent, images: Record<string, string> = {}, expected = ticket(owner, id)) {
      if (!validId(owner) || !validId(id) || !binding || !isReadContent(content) || !canCacheHarumadi(content) || content.harumadi.id !== id) return;
      const savedAt = now();
      // 서명 URL·인증 토큰·동의 영수증은 저장하지 않고 표시용 일반 마디만 복제한다.
      const entries = content.entries.map(entry => ({ id: entry.id, title: entry.title, content: entry.content,
        image: isCachedImage(images[entry.id]) ? images[entry.id] : null, placeId: entry.placeId, placeName: entry.placeName,
        visitedAt: entry.visitedAt, sensitiveContent: false as const, publicationStatus: "private" as const, publication: null }));
      const missingImages = content.entries.filter(entry => entry.image && !images[entry.id]).length;
      const raw = JSON.stringify({ schema: 2, owner, binding, savedAt, missingImages, content: { ...content, entries } });
      if (new TextEncoder().encode(raw).byteLength > MAX_BOOK_BYTES) return;
      await enqueue(owner, async () => {
        if (!current(owner, id, expected) || await storage.blocked(owner)) return;
        const previous = await index(owner);
        const books = previous.filter(book => book.id !== id && savedAt - book.savedAt <= HARUMADI_CACHE_TTL);
        books.unshift({ id, savedAt });
        const kept = books.slice(0, HARUMADI_CACHE_MAX_BOOKS);
        // 파일 기록 후에 삭제가 요청되어도 다음 큐의 삭제가 최종 상태가 된다.
        await storage.write(owner, `${id}.json`, raw);
        await storage.write(owner, "index.json", JSON.stringify(kept));
        for (const book of previous) if (!kept.some(item => item.id === book.id)) await remove(owner, book.id);
      });
    },
    async clearBook(owner: string, id: string) {
      if (!validId(owner) || !validId(id)) return;
      bookEpoch.set(`${owner}:${id}`, (bookEpoch.get(`${owner}:${id}`) ?? 0) + 1);
      await enqueue(owner, async () => {
        await storage.write(owner, "index.json", JSON.stringify((await index(owner)).filter(book => book.id !== id)));
        await storage.remove(owner, `${id}.json`).catch(() => {});
      });
    },
    async clearOwner(owner: string) {
      if (!validId(owner)) return;
      ownerEpoch.set(owner, (ownerEpoch.get(owner) ?? 0) + 1);
      await enqueue(owner, async () => {
        // 제거 중 저장/읽기를 차단한다. 파일 제거 실패 시 다음 실행에도 차단을 남긴다.
        await storage.block(owner, true);
        await storage.clear(owner);
        await storage.block(owner, false);
      });
    },
  };
}

function isCachedImage(value: unknown): value is string {
  return typeof value === "string" && value.length <= 220_000 && /^data:image\/jpeg;base64,[a-zA-Z0-9+/=]+$/.test(value);
}
export function isReadContent(value: unknown): value is HarumadiContent {
  if (!value || typeof value !== "object") return false;
  const data = value as HarumadiContent, book = data.harumadi;
  return Boolean(book && validId(book.id) && typeof book.title === "string" && book.title.length <= 80 &&
    ["white-plain", "white-image", "green-plain", "green-image"].includes(book.coverStyle) &&
    Number.isSafeInteger(book.revision) && book.revision > 0 && typeof book.createdAt === "string" && Number.isFinite(Date.parse(book.createdAt)) &&
    typeof book.updatedAt === "string" && Number.isFinite(Date.parse(book.updatedAt)) &&
    Array.isArray(book.entryIds) && book.entryIds.length <= 12 && new Set(book.entryIds).size === book.entryIds.length &&
    Array.isArray(data.entries) && data.entries.length === book.entryIds.length && new Set(data.entries.map(e => e.id)).size === data.entries.length &&
    data.entries.every(entry => validId(entry.id) && book.entryIds.includes(entry.id) &&
      typeof entry.title === "string" && entry.title.length <= 80 && typeof entry.content === "string" && entry.content.length <= 4000 &&
      (entry.image === null || typeof entry.image === "string") && typeof entry.placeName === "string" && entry.placeName.length <= 120 &&
      (entry.placeId === null || typeof entry.placeId === "string") && typeof entry.visitedAt === "string" && Number.isFinite(Date.parse(entry.visitedAt))) &&
    typeof data.version === "string" && /^[a-f0-9]{64}$/.test(data.version) && typeof data.cacheable === "boolean" &&
    Number.isSafeInteger(data.totalRecordCount) && data.totalRecordCount >= data.entries.length);
}

const folder = (owner: string) => `tuti-harumadi-read-v1/${owner}`;
const nativeStorage: ReadCacheStorage = {
  async read(owner, file) {
    const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
    const result = await Filesystem.readFile({ directory: Directory.Cache, path: `${folder(owner)}/${file}`, encoding: Encoding.UTF8 });
    if (typeof result.data !== "string") throw new Error("invalid cache encoding"); return result.data;
  },
  async write(owner, file, data) {
    const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
    await Filesystem.writeFile({ directory: Directory.Cache, path: `${folder(owner)}/${file}`, encoding: Encoding.UTF8, data, recursive: true });
  },
  async remove(owner, file) {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    await Filesystem.deleteFile({ directory: Directory.Cache, path: `${folder(owner)}/${file}` });
  },
  async clear(owner) {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    // 존재하지 않는 폴더와 실제 실패를 구분해 삭제 실패 시 차단을 해제하지 않는다.
    try { await Filesystem.stat({ directory: Directory.Cache, path: folder(owner) }); }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/not exist|not found|ENOENT/i.test(message)) return; throw error;
    }
    await Filesystem.rmdir({ directory: Directory.Cache, path: folder(owner), recursive: true });
  },
  blocked: async owner => await preferencesStorage.getItem(`tuti-harumadi-cache-blocked:${owner}`) === "blocked",
  async block(owner, blocked) {
    if (blocked) await preferencesStorage.setItem(`tuti-harumadi-cache-blocked:${owner}`, "blocked");
    else await preferencesStorage.removeItem(`tuti-harumadi-cache-blocked:${owner}`);
  },
};
export const harumadiReadCache = createHarumadiReadCache(nativeStorage);
export async function readCacheBinding(accessToken: string): Promise<string | null> {
  if (!globalThis.crypto?.subtle) return null;
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(accessToken));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}
