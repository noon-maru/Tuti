import { fetchWithPinnedSession, isSessionCurrent } from "@/lib/auth/session";
import type { TutiSession } from "@/shared/api/session";
import { normalizePlaceQuery, type PlaceSuggestionsResponse } from "@/shared/api/placeSuggestions";

export async function fetchJournalPlaceSuggestions(session: TutiSession, query: string, signal?: AbortSignal): Promise<PlaceSuggestionsResponse> {
  if (!isSessionCurrent(session)) throw new Error("계정이 변경되었어요.");
  const response = await fetchWithPinnedSession(`places/suggestions?q=${encodeURIComponent(normalizePlaceQuery(query))}`, { signal, cache: "no-store" }, session.userId);
  if (!response.ok) throw new Error("장소 제안을 불러오지 못했어요.");
  const data = await response.json() as PlaceSuggestionsResponse;
  if (!isSessionCurrent(session)) throw new Error("계정이 변경되었어요.");
  return data;
}
