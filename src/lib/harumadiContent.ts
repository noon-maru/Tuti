import { apiUrl } from "./api/apiUrl";
import { fetchWithPinnedSession, getSessionSnapshot } from "./auth/session";
import { canCacheHarumadi, harumadiReadCache, isReadContent, readCacheBinding, type CacheTicket } from "./harumadiReadCache";
import { HarumadiRequestError } from "./harumadis";
import type { HarumadiContent } from "@/shared/api/harumadi";

export type HarumadiRead = { content: HarumadiContent; ticket: CacheTicket; cached: boolean; savedAt?: number; missingImages: number };
export const authoritativeReadError = (error: unknown) => error instanceof HarumadiRequestError &&
  error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429;

export async function loadCachedHarumadi(owner: string, id: string): Promise<HarumadiRead | null> {
  const session = getSessionSnapshot();
  if (!session || session.userId !== owner) return null;
  const started = harumadiReadCache.ticket(owner, id);
  const cached = await harumadiReadCache.get(owner, id, await readCacheBinding(session.accessToken));
  if (!cached || getSessionSnapshot()?.accessToken !== session.accessToken || !harumadiReadCache.current(owner, id, started)) return null;
  return { ...cached, ticket: started, cached: true };
}

export async function fetchHarumadiContent(owner: string, id: string, signal?: AbortSignal): Promise<HarumadiRead> {
  const session = getSessionSnapshot();
  if (!session || session.userId !== owner) throw new HarumadiRequestError("계정을 다시 확인해주세요.", 401);
  let ticket = harumadiReadCache.ticket(owner, id);
  const stillCurrent = () => getSessionSnapshot()?.userId === owner && getSessionSnapshot()?.accessToken === session.accessToken && harumadiReadCache.current(owner, id, ticket);
  try {
    const response = await fetchWithPinnedSession(`harumadis/${encodeURIComponent(id)}/content`, { cache: "no-store", signal }, owner);
    if (!response.ok) throw new HarumadiRequestError("하루마디를 확인하지 못했어요.", response.status);
    const body: unknown = await response.json();
    if (!isReadContent(body)) throw new HarumadiRequestError("하루마디 응답을 확인하지 못했어요.", 502);
    if (!stillCurrent() || signal?.aborted) throw new Error("읽기 요청이 취소됐어요.");
    const content = { ...body, entries: body.entries.map(entry => ({ ...entry,
      image: entry.image?.startsWith("/api/") ? apiUrl(entry.image.slice(5)) : entry.image })) };
    if (!canCacheHarumadi(content)) {
      const clearing = harumadiReadCache.clearBook(owner, id);
      ticket = harumadiReadCache.ticket(owner, id);
      await clearing.catch(() => {});
      if (!stillCurrent()) throw new Error("읽기 요청이 취소됐어요.");
    } else {
      // 이전 조회에서 진행 중인 사진 저장이 최신 스냅샷을 덮지 못하게 한다.
      ticket = harumadiReadCache.begin(owner, id);
      // 서버 응답은 디스크·사진 다운로드를 기다리지 않고 즉시 화면에 전달한다.
      void persistContent(owner, id, session.accessToken, content, ticket, stillCurrent).catch(() => {});
    }
    return { content, ticket, cached: false, missingImages: 0 };
  } catch (error) {
    if (authoritativeReadError(error)) await harumadiReadCache.clearBook(owner, id).catch(() => {});
    throw error;
  }
}

async function persistContent(owner: string, id: string, accessToken: string, content: HarumadiContent, ticket: CacheTicket, current: () => boolean) {
  const binding = await readCacheBinding(accessToken);
  if (!binding || !current()) return;
  const previous = await harumadiReadCache.get(owner, id, binding);
  if (!current()) return;
  const images: Record<string, string> = previous?.content.version === content.version
    ? Object.fromEntries(previous.content.entries.filter(entry => entry.image).map(entry => [entry.id, entry.image!])) : {};
  await harumadiReadCache.put(owner, id, binding, content, images, ticket);
  const photos = content.entries;
  let cursor = 0;
  const worker = async () => {
    while (cursor < photos.length && current()) {
      const entry = photos[cursor++];
      if (!entry.image || images[entry.id]) continue;
      const image = await thumbnail(entry.image).catch(() => null);
      if (image && current()) images[entry.id] = image;
    }
  };
  await Promise.all([worker(), worker()]);
  if (current() && Object.keys(images).length) await harumadiReadCache.put(owner, id, binding, content, images, ticket);
}

async function thumbnail(image: string): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const base = new URL(apiUrl("journal-entry-images/"), window.location.origin);
  const url = new URL(image, window.location.origin);
  // 외부 사진 서버에 새 요청을 보내거나 서명 URL을 디스크에 보관하지 않는다.
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return null;
  url.searchParams.set("thumbnail", "1");
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!response.ok || !response.headers.get("content-type")?.startsWith("image/jpeg")) return null;
    if (Number(response.headers.get("content-length")) > 160_000) { await response.body?.cancel(); return null; }
    const blob = await response.blob();
    if (blob.size > 160_000) return null;
    return await new Promise<string | null>(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null); reader.readAsDataURL(blob);
    });
  } finally { window.clearTimeout(timeout); }
}
