import { fetchWithPinnedSession, getSessionSnapshot } from "./auth/session";
import type { JournalNotebook, NotebookList, NotebookSettings, NotebookUpdate } from "@/shared/api/journalNotebook";

async function request<T>(owner: string, suffix: string, init?: RequestInit): Promise<T> {
  const response = await fetchWithPinnedSession(`journal-notebooks${suffix}`, { cache: "no-store", ...init }, owner);
  const body = await response.json();
  if (getSessionSnapshot()?.userId !== owner) throw new Error("계정이 바뀌었어요. 다시 열어주세요.");
  if (!response.ok) throw new Error(body.error ?? "기록집을 불러오지 못했어요.");
  return body as T;
}
export const notebookPath = (id: string) => `/journal/notebook?notebookId=${encodeURIComponent(id)}`;
export const fetchNotebooks = (owner: string, cursor?: string) => request<NotebookList>(owner, cursor ? `?cursor=${encodeURIComponent(cursor)}` : "");
export const fetchNotebook = async (owner: string, id: string) => (await request<{ notebook: JournalNotebook }>(owner, `/${encodeURIComponent(id)}`)).notebook;
export const createNotebook = async (owner: string, input: NotebookSettings) => (await request<{ notebook: JournalNotebook }>(owner, "", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) })).notebook;
export const updateNotebook = async (owner: string, id: string, input: NotebookUpdate) => (await request<{ notebook: JournalNotebook }>(owner, `/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) })).notebook;
export const deleteNotebook = (owner: string, id: string) => request<{ deleted: boolean }>(owner, `/${encodeURIComponent(id)}`, { method: "DELETE" });
