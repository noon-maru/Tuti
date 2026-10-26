import { fetchWithPinnedSession, getSessionSnapshot } from "./auth/session";
import type { HarumadiPdfsResponse, StoredHarumadiPdf } from "@/shared/api/harumadiPdf";

async function request(ownerId: string, path: string, init?: RequestInit) {
  const response = await fetchWithPinnedSession(path, { cache: "no-store", ...init }, ownerId);
  if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(body?.error ?? "하루마디를 불러오지 못했어요."); }
  if (getSessionSnapshot()?.userId !== ownerId) throw new Error("계정이 변경됐어요.");
  return response;
}
export async function fetchLibraryHarumadis(ownerId: string, cursor?: string) {
  const params = new URLSearchParams({ limit: "12", ...(cursor ? { cursor } : {}) });
  return await (await request(ownerId, `harumadi-pdfs?${params}`)).json() as HarumadiPdfsResponse;
}
export async function fetchLibraryHarumadi(ownerId: string, harumadiPdfId: string) {
  const response = await request(ownerId, `harumadi-pdfs/${encodeURIComponent(harumadiPdfId)}`);
  return ((await response.json()) as { harumadiPdf: StoredHarumadiPdf }).harumadiPdf;
}
export async function fetchLibraryCover(ownerId: string, harumadiPdfId: string, kind: "pdf" | "harumadi" = "pdf") {
  return (await request(ownerId, `${kind === "harumadi" ? "harumadis" : "harumadi-pdfs"}/${encodeURIComponent(harumadiPdfId)}/cover`)).blob();
}
export async function saveLibraryCover(ownerId: string, harumadiPdfId: string, bytes: Uint8Array) {
  await request(ownerId, `harumadi-pdfs/${encodeURIComponent(harumadiPdfId)}/cover`, { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: bytes.slice().buffer });
}
export function libraryHarumadiPath(harumadiPdfId: string) { return `/harumadi/pdf/view?harumadiPdfId=${encodeURIComponent(harumadiPdfId)}`; }
