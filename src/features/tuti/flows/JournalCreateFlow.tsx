"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { requestLoginNudge } from "@/features/tuti/auth/loginNudge";
import { useTutiJournalEntries } from "@/features/tuti/hooks/useTutiJournalEntries";
import { MadiCreateScreen } from "@/features/tuti/screens/journal/MadiCreateScreen";
import { recordRecommendationAction } from "@/lib/tutiApi";
import { useTutiStore } from "@/store/tuti";
import { fetchHarumadi, harumadiPath } from "@/lib/harumadis";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/features/tuti/hooks/useSession";
import { useLifecycleView } from "../hooks/useLifecycleView";
import { trackLifecycle } from "@/lib/lifecycle";
import { useNotificationPresence } from "../hooks/useNotificationPresence";
import { notificationRequest } from "@/lib/notificationSettings";
import { cachedMadiDestination, madiDestinationScopeChanged } from "@/lib/madiComposeDestination";

export function JournalCreateFlow() {
  const ownerId = useSession()?.userId;
  const harumadiId = useSearchParams().get("harumadiId");
  return <JournalComposer key={`${ownerId ?? "pending"}:${harumadiId ?? "new"}`} ownerId={ownerId} harumadiId={harumadiId} />;
}

function JournalComposer({ ownerId, harumadiId }: { ownerId?: string; harumadiId: string | null }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const client = useQueryClient();
  // Refresh metadata without remounting the editor or moving a private draft into a shared scope.
  const [initialDestination] = useState(() => cachedMadiDestination(client, ownerId, harumadiId));
  const [draftDestination] = useState(() => initialDestination ?? (harumadiId ? { id: harumadiId, title: "" } : undefined));
  const book = useQuery({ queryKey: ["compose-harumadi", ownerId, harumadiId],
    queryFn: () => fetchHarumadi(ownerId!, harumadiId!), enabled: Boolean(ownerId && harumadiId), retry: false,
    refetchOnWindowFocus: false, refetchOnReconnect: false });
  const freshDestination = book.isSuccess && book.isFetchedAfterMount && !book.isFetching && book.data.id === harumadiId ? book.data : undefined;
  const destination = freshDestination ?? draftDestination;
  const scopeChanged = madiDestinationScopeChanged(initialDestination, freshDestination);
  const destinationVerified = Boolean(freshDestination && !scopeChanged);
  useNotificationPresence(harumadiId, true);
  const savedEntryId = useRef<string | null>(null);
  const request = useRef<{ hash: string; id: string } | null>(null);
  const resetComposition = () => { request.current = null; savedEntryId.current = null; };
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

  return <MadiCreateScreen draftOwnerId={ownerId}
    firstMadi={isSuccess && entries.length === 0}
    inHarumadi={Boolean(harumadiId)}
    continueInHarumadi={Boolean(harumadiId && searchParams.get("continue") === "1")}
    onStartAnother={resetComposition}
    onContinueInHarumadi={bookId => {
      resetComposition();
      router.replace(`/madi/new?from=library&harumadiId=${encodeURIComponent(bookId)}&continue=1`);
    }}
    destination={destination}
    draftDestination={draftDestination}
    destinationVerified={destinationVerified}
    destinationScopeChanged={scopeChanged}
    destinationError={book.isError}
    onRetryDestination={() => void book.refetch()}
    initialPlace={initialPlaceId && initialPlaceName ? { id: initialPlaceId, name: initialPlaceName } : undefined}
    collectionLabel={fromExplore ? "작은 여행으로 돌아가기" : fromLibrary ? "하루마디로 돌아가기" : "작성 마치기"}
    onBack={returnToSource}
    onSave={async draft => {
      if (harumadiId && !destinationVerified) throw new Error("담을 하루마디를 다시 확인해주세요. 작성 중인 내용은 그대로 남아 있어요.");
      const input = { ...draft, ...(harumadiId ? { harumadiId, expectedHarumadiShared: Boolean(book.data?.shared) } : {}) };
      const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(input)));
      const hash = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
      if (request.current?.hash !== hash) request.current = { hash, id: crypto.randomUUID() };
      let entry;
      try { entry = await addEntry({ ...input, requestId: request.current.id }); }
      catch (error) {
        if (harumadiId) void book.refetch();
        trackLifecycle("compose_failed", { origin: "request_failed" }); throw error;
      }
      if (recommendationId) {
        void recordRecommendationAction({ journeyId: recommendationId, action: "journal_created",
          placeId: entry.placeId ?? undefined, metadata: { entryId: entry.id } }).catch(error => {
          console.warn("마디 작성 행동을 저장하지 못했습니다.", error);
        });
      }
      return entry;
    }}
    onSaved={entry => {
      const notificationId = searchParams.get("notificationId");
      if (source === "notification" && notificationId) void notificationRequest("notifications/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notificationId, action: "written" }) }).catch(() => {});
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
