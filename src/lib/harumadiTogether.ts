import { Capacitor } from "@capacitor/core";
import { fetchWithPinnedSession, getSessionSnapshot } from "./auth/session";
import { harumadiReadCache } from "./harumadiReadCache";
import { HarumadiRequestError } from "./harumadis";
import type { HarumadiTogether, HarumadiComment } from "@/shared/api/harumadiTogether";
import { harumadiInviteUrl } from "@/shared/api/harumadiTogether";
import { apiUrl } from "./api/apiUrl";
import { shareContent } from "./shareContent";

export async function togetherRequest<T>(owner: string, bookId: string, area: string, init?: RequestInit): Promise<T> {
  const response = await fetchWithPinnedSession(`harumadis/${encodeURIComponent(bookId)}/${area}`, { cache: "no-store", ...init }, owner);
  const data = await response.json();
  if (getSessionSnapshot()?.userId !== owner) throw new Error("계정이 바뀌었어요. 다시 열어주세요.");
  if (!response.ok) throw new HarumadiRequestError(data.error ?? "함께 채우기를 확인하지 못했어요.", response.status);
  return data as T;
}
export const fetchTogether = (owner: string, id: string) => togetherRequest<HarumadiTogether>(owner, id, "together");
export async function changeTogether<T = { added?: boolean }>(owner: string, id: string, action: string, target?: string, extras: Record<string, unknown> = {}) {
  try { return await togetherRequest<T>(owner, id, "together", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, target, ...extras }) }); }
  finally { if (action === "leave" || action === "remove-member" || action === "remove-entry") await harumadiReadCache.clearBook(owner, id).catch(() => {}); }
}
export type CommentsPage = { comments: (HarumadiComment & { replyCount: number })[]; nextCursor: string | null };
export const fetchComments = (owner: string, id: string, parentId: string | null, cursor?: string) => togetherRequest<CommentsPage>(owner, id, `comments?${new URLSearchParams({ ...(parentId ? { parentId } : {}), ...(cursor ? { cursor } : {}) })}`);

export async function shareHarumadiInvite(token: string) {
  const url = harumadiInviteUrl(token, apiUrl(""), window.location.origin);
  const data = { title: "하루마디 함께 채우기", text: "각자의 순간을 하나의 하루마디에 담아보세요.", url };
  try {
    if (Capacitor.isNativePlatform()) { const { Share } = await import("@capacitor/share"); await Share.share({ ...data, dialogTitle: "함께할 사람 초대하기" }); return "shared"; }
    return await shareContent(data);
  } catch (error) {
    if (error instanceof Error && (error.name === "AbortError" || /cancelled|canceled/i.test(error.message))) return "cancelled";
    throw error;
  }
}
