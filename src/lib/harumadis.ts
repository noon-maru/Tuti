import { fetchWithPinnedSession, getSessionSnapshot } from "./auth/session";
import type { Harumadi, HarumadiList, HarumadiSettings, HarumadiUpdate, HarumadiOrderUpdate } from "@/shared/api/harumadi";
import { harumadiReadCache } from "./harumadiReadCache";

export class HarumadiRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function request<T>(owner: string, suffix: string, init?: RequestInit): Promise<T> {
  const response = await fetchWithPinnedSession(`harumadis${suffix}`, { cache: "no-store", ...init }, owner);
  const body = await response.json();
  if (getSessionSnapshot()?.userId !== owner) throw new Error("계정이 바뀌었어요. 다시 열어주세요.");
  if (!response.ok) throw new HarumadiRequestError(body.error ?? "하루마디를 불러오지 못했어요.", response.status);
  return body as T;
}
export const harumadiPath = (id: string) => `/harumadi?harumadiId=${encodeURIComponent(id)}`;
export const fetchHarumadis = (owner: string, cursor?: string) => request<HarumadiList>(owner, cursor ? `?cursor=${encodeURIComponent(cursor)}` : "");
export async function fetchRecentHarumadis(owner: string, signal?: AbortSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener("abort", abort, { once: true });
  // Optional ranking must not hold the normal book picker indefinitely.
  const timer = setTimeout(abort, 1200);
  try { return await request<{ harumadis: Harumadi[] }>(owner, "/recent", { signal: controller.signal }); }
  finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
}
export const fetchHarumadi = async (owner: string, id: string) => (await request<{ harumadi: Harumadi }>(owner, `/${encodeURIComponent(id)}`)).harumadi;
export const createHarumadi = async (owner: string, input: HarumadiSettings) => (await request<{ harumadi: Harumadi }>(owner, "", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) })).harumadi;
export const updateHarumadi = async (owner: string, id: string, input: HarumadiUpdate) => {
  try { return (await request<{ harumadi: Harumadi }>(owner, `/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) })).harumadi; }
  finally { await harumadiReadCache.clearBook(owner, id).catch(() => {}); }
};
export const deleteHarumadi = async (owner: string, id: string) => {
  try { return await request<{ deleted: boolean }>(owner, `/${encodeURIComponent(id)}`, { method: "DELETE" }); }
  finally { await harumadiReadCache.clearBook(owner, id).catch(() => {}); }
};
export const reorderHarumadi = async (owner: string, id: string, input: HarumadiOrderUpdate) => {
  let rejected = false;
  try { return (await request<{ harumadi: Harumadi }>(owner, `/${encodeURIComponent(id)}/order`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  })).harumadi; }
  catch (error) {
    // 명시적으로 거절된 순서는 저장되지 않았다. 편집 화면을 유지해 충돌 사유를 보여준다.
    rejected = error instanceof HarumadiRequestError && [400, 409, 413].includes(error.status);
    throw error;
  } finally {
    if (!rejected) await harumadiReadCache.clearBook(owner, id).catch(() => {});
  }
};
