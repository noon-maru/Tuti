"use client";

import { useEffect, useState } from "react";
import { useSession } from "./useSession";
import { isSessionCurrent } from "@/lib/auth/session";
import { fetchJournalPlaceSuggestions } from "@/lib/placeSuggestions";
import { normalizePlaceQuery, type PlaceSuggestionsResponse } from "@/shared/api/placeSuggestions";

type Result = { owner: string; token: string; query: string; status: "ready" | "error"; data: PlaceSuggestionsResponse };
const empty: PlaceSuggestionsResponse = { history: [], places: [] };

export function useJournalPlaceSuggestions(value: string, enabled: boolean) {
  const session = useSession(), query = normalizePlaceQuery(value);
  const [result, setResult] = useState<Result | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled || !session) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const data = await fetchJournalPlaceSuggestions(session, query, controller.signal);
        if (!controller.signal.aborted && isSessionCurrent(session)) setResult({ owner: session.userId, token: session.accessToken, query, status: "ready", data });
      } catch {
        if (!controller.signal.aborted && isSessionCurrent(session)) setResult({ owner: session.userId, token: session.accessToken, query, status: "error", data: empty });
      }
    }, 200);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [enabled, query, session, attempt]);

  const current = enabled && session && result?.owner === session.userId && result.token === session.accessToken && result.query === query ? result : null;
  return { ...(current?.data ?? empty), status: !enabled ? "idle" as const : current?.status ?? "loading" as const,
    retry: () => { setResult(null); setAttempt(count => count + 1); } };
}
