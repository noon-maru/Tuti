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
import { publicPlaceReturnPath, savedMadiSelectionPath } from "@/lib/savedMadiSelection";
import { AppLoadingScreen } from "@/features/tuti/components/LoadingIndicator";
import { welcomeMadiCancelPath } from "@/shared/tuti/welcomeGuide";

export function JournalCreateFlow() {
  const router = useRouter();
  const ownerId = useSession()?.userId;
  const params = useSearchParams();
  const harumadiId = params.get("harumadiId");
  const savedId = params.get("savedEntryId");
  const query = useTutiJournalEntries(!savedId);
  if (savedId) return <SavedMadiSelection key={`${ownerId}:${savedId}`} ownerId={ownerId} entryId={savedId} />;
  // Unknown is not an existing madi: mount the editor only once its title is known.
  // Retain it after a background refetch failure instead of discarding entered text.
  const returnBeforeWriting = () => {
    const source = params.get("from");
    const welcomeReturn = welcomeMadiCancelPath(params.get("cancelTo"));
    if (welcomeReturn || source === "welcome") { router.replace(welcomeReturn ?? "/entry"); return; }
    if (source === "library" && params.get("cancelTo") === "library") { router.replace("/"); return; }
    if (harumadiId) { router.replace(harumadiPath(harumadiId)); return; }
    const placeReturn = publicPlaceReturnPath(source, params.get("placeId"));
    if (placeReturn) { router.replace(placeReturn); return; }
    if (source === "library" || source === "explore") { router.replace(source === "explore" ? "/explore" : "/"); return; }
    if (window.history.length > 1) router.back();
    else router.replace("/madi");
  };
  if (!ownerId || (!query.isSuccess && !query.dataUpdatedAt && !query.isError)) return <AppLoadingScreen label="작성 화면을 준비하고 있어요." />;
  if (query.isError && !query.dataUpdatedAt) return <JournalDetailStatusScreen message="마디를 확인하지 못했어요. 다시 시도해주세요." onBack={returnBeforeWriting} onRetry={() => void query.refetch()} />;
  return <JournalComposer key={`${ownerId}:${harumadiId ?? "new"}:${params.get("placeId") ?? "general"}`} ownerId={ownerId} harumadiId={harumadiId} initialFirstMadi={query.entries.length === 0} />;
}

function SavedMadiSelection({ ownerId, entryId }: { ownerId?: string; entryId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const source = params.get("from");
  const sharedPlaceReturn = publicPlaceReturnPath(source, params.get("placeId"));
  const query = useTutiJournalEntries();
  const done = () => { requestLoginNudge("journal_created"); router.replace(sharedPlaceReturn ?? (source === "explore" ? "/explore" : source === "library" || source === "welcome" ? "/" : "/madi")); };
  if (!ownerId || query.isPending) return <JournalDetailStatusScreen loading message="저장한 마디를 확인하고 있어요." onBack={done} />;
  if (query.isError) return <JournalDetailStatusScreen message="저장한 마디를 확인하지 못했어요." onBack={done} onRetry={() => void query.refetch()} />;
  // Resolve only within the current account's permission-filtered query; never recreate a missing entry.
  if (!query.entries.some(entry => entry.id === entryId)) return <JournalDetailStatusScreen message="이 계정에서 마디를 찾지 못했어요. 전체 마디에서 확인해주세요." onBack={done} />;
  return <MadiHarumadiSelection ownerId={ownerId} entryId={entryId} onDone={done} onNext={bookId => {
    router.replace(bookId ? `/madi/new?from=library&harumadiId=${encodeURIComponent(bookId)}&continue=1`
      : `/madi/new${source === "explore" ? "?from=explore" : source === "library" || source === "welcome" ? "?from=library" : ""}`);
  }} />;
}

function JournalComposer({ ownerId, harumadiId, initialFirstMadi }: { ownerId?: string; harumadiId: string | null; initialFirstMadi: boolean }) {
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
  const { addEntry, updateEntry } = useTutiJournalEntries();
  const [firstMadi] = useState(initialFirstMadi);
  const setActiveJournalEntry = useTutiStore(state => state.setActiveJournalEntry);
  const source = searchParams.get("from");
  const fromLibrary = source === "welcome" || source === "library";
  const fromExplore = source === "explore";
  useLifecycleView("compose_started", fromExplore ? "explore" : harumadiId ? "book" : "home");
  const initialPlaceId = searchParams.get("placeId");
  const initialPlaceName = searchParams.get("placeName");
  const recommendationId = searchParams.get("journeyId");
  const sharedPlaceReturn = publicPlaceReturnPath(source, initialPlaceId);
  const returnToSource = () => {
    if (!savedEntryId.current) {
      const welcomeReturn = welcomeMadiCancelPath(searchParams.get("cancelTo"));
      if (welcomeReturn) { router.replace(welcomeReturn); return; }
      if (source === "welcome") { router.replace("/entry"); return; }
    }
    // 책 지정은 저장 목적지다. 책장에서 시작한 미저장 작성의 취소 목적지와 구분한다.
    if (source === "library" && searchParams.get("cancelTo") === "library" && !savedEntryId.current) { router.replace("/"); return; }
    if (harumadiId) { router.replace(harumadiPath(harumadiId)); return; }
    if (sharedPlaceReturn) { router.replace(sharedPlaceReturn); return; }
    if (fromLibrary) { router.replace("/"); return; }
    if (fromExplore) { router.replace("/explore"); return; }
    if (window.history.length > 1) router.back();
    else router.replace(fromExplore ? "/explore" : "/madi");
  };

  return <MadiCreateScreen draftOwnerId={ownerId}
    firstMadi={firstMadi}
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
    collectionLabel={harumadiId ? "하루마디로 돌아가기" : sharedPlaceReturn ? "공유된 장소로 돌아가기" : fromExplore ? "나들이로 돌아가기" : fromLibrary ? "내 책장으로 돌아가기" : "작성 마치기"}
    onBack={returnToSource}
    onSave={async (draft, existing) => {
      if (existing) return updateEntry(existing.id, draft);
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
      if (!harumadiId && !entry.savedHarumadi) router.replace(savedMadiSelectionPath(entry.id, source, initialPlaceId));
    }}
    // 하루마디 안에서 시작했다면 담을 곳은 이미 정해져 있다.
    // 저장 API가 연결까지 원자적으로 완료했으므로 읽기 위치만 전달한다.
    harumadiSelection={ownerId && !harumadiId ? { ownerId,
      onDone: () => { requestLoginNudge("journal_created"); returnToSource(); } } : undefined}
    onCollection={() => {
      requestLoginNudge("journal_created");
      if (harumadiId) router.replace(`${harumadiPath(harumadiId)}${savedEntryId.current ? `&focusEntryId=${encodeURIComponent(savedEntryId.current)}` : ""}`);
      else returnToSource();
    }}
  />;
}
