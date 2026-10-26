import { fetchWithPinnedSession, getSessionSnapshot } from "./auth/session";
import type { Harumadi, HarumadiList, HarumadiSettings, HarumadiUpdate } from "@/shared/api/harumadi";

async function request<T>(owner: string, suffix: string, init?: RequestInit): Promise<T> {
  const response = await fetchWithPinnedSession(`harumadis${suffix}`, { cache: "no-store", ...init }, owner);
  const body = await response.json();
  if (getSessionSnapshot()?.userId !== owner) throw new Error("계정이 바뀌었어요. 다시 열어주세요.");
  if (!response.ok) throw new Error(body.error ?? "하루마디를 불러오지 못했어요.");
  return body as T;
}
export const harumadiPath = (id: string) => `/harumadi?harumadiId=${encodeURIComponent(id)}`;
export const fetchHarumadis = (owner: string, cursor?: string) => request<HarumadiList>(owner, cursor ? `?cursor=${encodeURIComponent(cursor)}` : "");
export const fetchHarumadi = async (owner: string, id: string) => (await request<{ harumadi: Harumadi }>(owner, `/${encodeURIComponent(id)}`)).harumadi;
export const createHarumadi = async (owner: string, input: HarumadiSettings) => (await request<{ harumadi: Harumadi }>(owner, "", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) })).harumadi;
export const updateHarumadi = async (owner: string, id: string, input: HarumadiUpdate) => (await request<{ harumadi: Harumadi }>(owner, `/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) })).harumadi;
export const deleteHarumadi = (owner: string, id: string) => request<{ deleted: boolean }>(owner, `/${encodeURIComponent(id)}`, { method: "DELETE" });
