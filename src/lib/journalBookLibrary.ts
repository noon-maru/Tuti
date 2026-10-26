import { fetchWithPinnedSession, getSessionSnapshot } from "./auth/session";
import type { JournalBooksResponse, StoredJournalBook } from "@/shared/api/journalBook";

async function request(ownerId: string, path: string, init?: RequestInit) {
  const response = await fetchWithPinnedSession(path, { cache: "no-store", ...init }, ownerId);
  if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(body?.error ?? "기록집을 불러오지 못했어요."); }
  if (getSessionSnapshot()?.userId !== ownerId) throw new Error("계정이 변경됐어요.");
  return response;
}
export async function fetchLibraryBooks(ownerId: string, cursor?: string) {
  const params = new URLSearchParams({ limit: "12", ...(cursor ? { cursor } : {}) });
  return await (await request(ownerId, `journal-books?${params}`)).json() as JournalBooksResponse;
}
export async function fetchLibraryBook(ownerId: string, bookId: string) {
  const response = await request(ownerId, `journal-books/${encodeURIComponent(bookId)}`);
  return ((await response.json()) as { book: StoredJournalBook }).book;
}
export async function fetchLibraryCover(ownerId: string, bookId: string, kind: "pdf" | "notebook" = "pdf") {
  return (await request(ownerId, `${kind === "notebook" ? "journal-notebooks" : "journal-books"}/${encodeURIComponent(bookId)}/cover`)).blob();
}
export async function saveLibraryCover(ownerId: string, bookId: string, bytes: Uint8Array) {
  await request(ownerId, `journal-books/${encodeURIComponent(bookId)}/cover`, { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: bytes.slice().buffer });
}
export function libraryBookPath(bookId: string) { return `/journal/book/view?bookId=${encodeURIComponent(bookId)}`; }
