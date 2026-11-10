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
import { MadiHarumadiSelection } from "@/features/tuti/screens/journal/MadiHarumadiSelection";
import { JournalDetailStatusScreen } from "@/features/tuti/screens/journal/JournalDetailScreen";
import { savedMadiSelectionPath } from "@/lib/savedMadiSelection";

export function JournalCreateFlow() {
  const ownerId = useSession()?.userId;
  const params = useSearchParams();
  const harumadiId = params.get("harumadiId");
  const savedId = params.get("savedEntryId");
  if (savedId) return <SavedMadiSelection key={`${ownerId}:${savedId}`} ownerId={ownerId} entryId={savedId} />;
  return <JournalComposer key={`${ownerId ?? "pending"}:${harumadiId ?? "new"}`} ownerId={ownerId} harumadiId={harumadiId} />;
}

function SavedMadiSelection({ ownerId, entryId }: { ownerId?: string; entryId: string }) {
  const router = useRouter();
  const source = useSearchParams().get("from");
  const query = useTutiJournalEntries();
  const done = () => { requestLoginNudge("journal_created"); router.replace(source === "explore" ? "/explore" : source === "library" || source === "welcome" ? "/" : "/madi"); };
  if (!ownerId || query.isPending) return <JournalDetailStatusScreen loading message="저장한 마디를 확인하고 있어요." onBack={done} />;
  if (query.isError) return <JournalDetailStatusScreen message="저장한 마디를 확인하지 못했어요." onBack={done} onRetry={() => void query.refetch()} />;
  // Resolve only within the current account's permission-filtered query; never recreate a missing entry.
  if (!query.entries.some(entry => entry.id === entryId)) return <JournalDetailStatusScreen message="이 계정에서 마디를 찾지 못했어요. 전체 마디에서 확인해주세요." onBack={done} />;
  return <MadiHarumadiSelection ownerId={ownerId} entryId={entryId} onDone={done} onNext={bookId => {
    router.replace(bookId ? `/madi/new?from=library&harumadiId=${encodeURIComponent(bookId)}&continue=1`
      : `/madi/new${source === "explore" ? "?from=explore" : source === "library" || source === "welcome" ? "?from=library" : ""}`);
  }} />;
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
      if (!harumadiId && !entry.savedHarumadi) router.replace(savedMadiSelectionPath(entry.id, source));
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
