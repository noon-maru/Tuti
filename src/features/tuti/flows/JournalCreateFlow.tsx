"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useRef } from "react";
import { requestLoginNudge } from "@/features/tuti/auth/loginNudge";
import { useTutiJournalEntries } from "@/features/tuti/hooks/useTutiJournalEntries";
import { MadiCreateScreen } from "@/features/tuti/screens/journal/MadiCreateScreen";
import { recordRecommendationAction } from "@/lib/tutiApi";
import { useTutiStore } from "@/store/tuti";
import { harumadiPath } from "@/lib/harumadis";
import { useSession } from "@/features/tuti/hooks/useSession";
import { useLifecycleView } from "../hooks/useLifecycleView";
import { trackLifecycle } from "@/lib/lifecycle";

export function JournalCreateFlow() {
  const router = useRouter();
  const ownerId = useSession()?.userId;
  const searchParams = useSearchParams();
  const harumadiId = searchParams.get("harumadiId");
  const savedEntryId = useRef<string | null>(null);
  const request = useRef<{ hash: string; id: string } | null>(null);
  const { addEntry, entries, isSuccess } = useTutiJournalEntries();
  const setActiveJournalEntry = useTutiStore(state => state.setActiveJournalEntry);
  const source = searchParams.get("from");
  const fromLibrary = source === "welcome" || source === "library";
  const fromExplore = source === "explore";
  useLifecycleView("compose_started", harumadiId ? "book" : fromExplore ? "explore" : "home");
  const initialPlaceId = searchParams.get("placeId");
  const initialPlaceName = searchParams.get("placeName");
  const recommendationId = searchParams.get("journeyId");
  const returnToSource = () => {
    if (harumadiId) { router.replace(harumadiPath(harumadiId)); return; }
    if (fromLibrary) { router.replace("/"); return; }
    if (window.history.length > 1) router.back();
    else router.replace(fromExplore ? "/explore" : "/madi");
  };

  return <MadiCreateScreen key={ownerId ?? "pending"} draftOwnerId={ownerId}
    firstMadi={isSuccess && entries.length === 0}
    inHarumadi={Boolean(harumadiId)}
    initialPlace={initialPlaceId && initialPlaceName ? { id: initialPlaceId, name: initialPlaceName } : undefined}
    collectionLabel={fromExplore ? "작은 여행으로 돌아가기" : fromLibrary ? "하루마디로 돌아가기" : "작성 마치기"}
    onBack={returnToSource}
    onSave={async draft => {
      const input = { ...draft, ...(harumadiId ? { harumadiId } : {}) };
      const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(input)));
      const hash = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
      if (request.current?.hash !== hash) request.current = { hash, id: crypto.randomUUID() };
      let entry;
      try { entry = await addEntry({ ...input, requestId: request.current.id }); }
      catch (error) { trackLifecycle("compose_failed", { origin: "request_failed" }); throw error; }
      if (recommendationId) {
        void recordRecommendationAction({ journeyId: recommendationId, action: "journal_created",
          placeId: entry.placeId ?? undefined, metadata: { entryId: entry.id } }).catch(error => {
          console.warn("마디 작성 행동을 저장하지 못했습니다.", error);
        });
      }
      return entry;
    }}
    onSaved={entry => {
      savedEntryId.current = entry.id;
      setActiveJournalEntry(entry.id);
    }}
    // 하루마디 안에서 시작했다면 담을 곳은 이미 정해져 있다.
    // 완료 후 기존 addEntryId 경로로 해당 하루마디에 연결한다.
    harumadiSelection={ownerId && !harumadiId ? { ownerId,
      onDone: () => { requestLoginNudge("journal_created"); returnToSource(); } } : undefined}
    onCollection={() => {
      requestLoginNudge("journal_created");
      if (harumadiId) router.replace(`${harumadiPath(harumadiId)}${savedEntryId.current ? `&addEntryId=${encodeURIComponent(savedEntryId.current)}` : ""}`);
      else returnToSource();
    }}
  />;
}
