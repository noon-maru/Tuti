"use client";
import { screenTitleStyles } from "@/shared/ui/typography";
import { MadiLoadNotice } from "@/features/tuti/components/MadiLoadNotice";
import { ChevronDown, Plus, Search, X } from "lucide-react";
import { confirmAction, showErrorToast } from "@/lib/feedback";
import { madiDeletionMessage } from "@/shared/tuti/deletionCopy";

import { css } from "@emotion/react";
import styled from "@emotion/styled";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { MadiSearchField } from "@/features/tuti/components/MadiSearchField";
import { MadiSearchResults } from "@/features/tuti/components/MadiSearchResults";
import { useSession } from "@/features/tuti/hooks/useSession";
import { useHarumadiLibrary } from "@/features/tuti/hooks/useHarumadiLibrary";
import { MadiCollectionDialog } from "@/features/tuti/components/MadiCollectionDialog";
import { unfiledMadi } from "@/shared/tuti/unfiledMadi";
import { filterJournalEntries } from "@/shared/tuti/journalSearch";
import { ContextMenu } from "@/features/tuti/components/ContextMenu";
import { LoadingIndicator } from "@/features/tuti/components/LoadingIndicator";
import { ANDROID_BACK_EVENT } from "@/features/tuti/navigation/androidBack";
import { TutiPlaceIcon } from "@/features/tuti/components/TutiPlaceIcon";
import { JournalShareDialog } from "@/features/tuti/components/JournalShareDialog";
import { useJournalEntryTransitionTarget } from "@/features/tuti/components/JournalEntryTransition";
import { BackButton, BaseButton, TextButton } from "@/features/tuti/components/buttons";
import { ScreenFrame } from "@/features/tuti/components/ScreenFrame";
import { useTutiJournalEntries } from "@/features/tuti/hooks/useTutiJournalEntries";
import { useJournalShareActions } from "@/features/tuti/hooks/useJournalShareActions";
import { useTutiStore } from "@/store/tuti";
import { journalCardPreview } from "@/shared/tuti/journalCard";
import {
  fluidByViewportHeight,
  journalImageMaxWidth,
} from "@/styles/tokens";

const MAX_VISIBLE_MEMORY_CARDS = 7;
const MEMORY_CARD_RADIUS = Math.floor(MAX_VISIBLE_MEMORY_CARDS / 2);
const MEMORY_CARD_GAP_MIN = 40;
const MEMORY_CARD_GAP_MAX = 60;

export function JournalScreen({
  onBack,
  onCreateEntry,
  onEditEntry,
  onOpenEntry,
  onlyUnfiled = false,
  onChangeFilter,
  view = "cards",
  onChangeView,
}: {
  onBack: () => void;
  onCreateEntry?: () => void;
  onEditEntry?: (entryId: string) => void;
  onlyUnfiled?: boolean;
  onChangeFilter?: (onlyUnfiled: boolean) => void;
  view?: "cards" | "list";
  onChangeView?: (view: "cards" | "list") => void;
  onOpenEntry?: (
    entryId: string,
    image: string | null,
    sourceElement: HTMLElement,
  ) => void;
}) {
  const [stackDragY, setStackDragY] = useState(0);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchId = useId();
  const searchInput = useRef<HTMLInputElement>(null);
  const searchToggle = useRef<HTMLButtonElement>(null);
  const closeSearch = useCallback(() => {
    setSearch(""); setSearchOpen(false);
    window.requestAnimationFrame(() => searchToggle.current?.focus({ preventScroll: true }));
  }, []);
  useEffect(() => {
    if (!searchOpen) return;
    const frame = window.requestAnimationFrame(() => searchInput.current?.focus({ preventScroll: true }));
    const back = (event: Event) => { if (!event.defaultPrevented) { event.preventDefault(); closeSearch(); } };
    window.addEventListener(ANDROID_BACK_EVENT, back);
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener(ANDROID_BACK_EVENT, back); };
  }, [searchOpen, closeSearch]);
  const [collectEntryId, setCollectEntryId] = useState<string | null>(null);
  const ownerId = useSession()?.userId;
  const library = useHarumadiLibrary(ownerId);
  const [shareEntryId, setShareEntryId] = useState<string | null>(null);
  const stackPointerStart = useRef<number | null>(null);
  const selectedCardRef = useRef<HTMLButtonElement>(null);
  const stackRef = useRef<HTMLDivElement>(null);
  const wheelLocked = useRef(false);
  const suppressCardClick = useRef(false);
  const {
    entries: allEntries,
    isPending,
    isError,
    isFetching,
    refetch,
    changeEntryPublication,
    removeEntry,
  } = useTutiJournalEntries();
  const unfiled = useMemo(() => unfiledMadi(allEntries, library.isSuccess && !library.isFetching ? library.data?.pages.flatMap(page => page.harumadis) : undefined), [allEntries, library.isSuccess, library.isFetching, library.data]);
  const entries = useMemo(() => {
    const found = filterJournalEntries(allEntries, search);
    const available = new Set(unfiled?.map(entry => entry.id));
    return onlyUnfiled ? found.filter(entry => available.has(entry.id)) : found;
  }, [allEntries, search, onlyUnfiled, unfiled]);
  const collectEntry = allEntries.find(entry => entry.id === collectEntryId);
  const shareEntry = allEntries.find((entry) => entry.id === shareEntryId);
  const shareActions = useJournalShareActions({
    entry: shareEntry,
    changeEntryPublication,
  });
  const activeJournalEntryId = useTutiStore(
    (state) => state.activeJournalEntryId,
  );
  const setActiveJournalEntry = useTutiStore(
    (state) => state.setActiveJournalEntry,
  );
  const persistedEntryIndex = activeJournalEntryId
    ? entries.findIndex((entry) => entry.id === activeJournalEntryId)
    : -1;
  const selectedEntryIndex =
    persistedEntryIndex >= 0 ? persistedEntryIndex : 0;
  const selectedEntryId = entries[selectedEntryIndex]?.id ?? "";
  useJournalEntryTransitionTarget(
    selectedEntryId,
    selectedCardRef,
    "journal",
  );

  const deleteEntry = async (entryId: string) => {
    const target = entries.find((entry) => entry.id === entryId);
    if (!(await confirmAction(madiDeletionMessage(Boolean(target?.sensitiveContent)), {"title":"원본 마디 삭제","confirmLabel":"삭제하기","tone":"danger"}))) return;

    const remainingEntries = entries.filter(
      (entry) => entry.id !== entryId,
    );
    const deletedIndex = entries.findIndex(
      (entry) => entry.id === entryId,
    );
    const nextEntry =
      remainingEntries[
        Math.min(deletedIndex, remainingEntries.length - 1)
      ];

    try {
      await removeEntry(entryId);
      setActiveJournalEntry(nextEntry?.id);
    } catch (error) {
      showErrorToast(error instanceof Error
          ? error.message
          : "마디를 삭제하지 못했어요.");
    }
  };

  const moveStack = (direction: number) => {
    if (!entries.length) return;

    const nextIndex =
      (selectedEntryIndex + direction + entries.length) % entries.length;

    setActiveJournalEntry(entries[nextIndex].id);
    if (typeof document !== "undefined" && stackRef.current?.contains(document.activeElement)) {
      window.requestAnimationFrame(() => stackRef.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus({ preventScroll: true }));
    }
  };

  const scrollStack = (event: React.WheelEvent<HTMLDivElement>) => {
    const horizontalIntent =
      Math.abs(event.deltaX) >= Math.abs(event.deltaY);

    if (horizontalIntent) return;

    event.preventDefault();

    if (wheelLocked.current || Math.abs(event.deltaY) < 8) return;

    wheelLocked.current = true;
    moveStack(event.deltaY > 0 ? 1 : -1);
    window.setTimeout(() => {
      wheelLocked.current = false;
    }, 180);
  };

  const startStackDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary) return;

    stackPointerStart.current = event.clientY;
    suppressCardClick.current = false;
  };

  const updateStackDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (stackPointerStart.current === null) return;

    const distance = event.clientY - stackPointerStart.current;
    setStackDragY(Math.max(-72, Math.min(distance, 72)));

    if (Math.abs(distance) > 8) {
      suppressCardClick.current = true;

      if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
    }
  };

  const finishStackDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (stackPointerStart.current === null) return;

    const distance = event.clientY - stackPointerStart.current;

    if (Math.abs(distance) >= 28) {
      moveStack(distance > 0 ? 1 : -1);
      suppressCardClick.current = true;
    }

    stackPointerStart.current = null;
    setStackDragY(0);

    window.setTimeout(() => {
      suppressCardClick.current = false;
    }, 0);
  };

  const cancelStackDrag = () => {
    stackPointerStart.current = null;
    setStackDragY(0);
    suppressCardClick.current = false;
  };

  return (
    <Frame>
      <ListHeader>
        <BackButton type="button" aria-label="이전 화면으로" onClick={onBack} />
        <h1>{allEntries.length > 0 ? <ViewMenu label="마디 필터와 보기 방식" triggerContent={<>나의 마디<ChevronDown size={14} aria-hidden="true" /></>} items={[
          { label: "전체 마디", group: "보여줄 마디", kind: "radio", selected: !onlyUnfiled, disabled: !onChangeFilter, onSelect: () => { cancelStackDrag(); onChangeFilter?.(false); } },
          { label: "아직 담지 않은 마디", group: "보여줄 마디", kind: "radio", selected: onlyUnfiled, disabled: !onChangeFilter || (!onlyUnfiled && unfiled === null), onSelect: () => { cancelStackDrag(); onChangeFilter?.(true); } },
          { label: "카드로 보기", group: "보기 방식", kind: "radio", selected: view === "cards", disabled: !onChangeView, onSelect: () => { cancelStackDrag(); onChangeView?.("cards"); } },
          { label: "목록으로 보기", group: "보기 방식", kind: "radio", selected: view === "list", disabled: !onChangeView, onSelect: () => { cancelStackDrag(); onChangeView?.("list"); } },
        ]} /> : "나의 마디"}</h1>
        <HeaderTools>
        {allEntries.length > 0 && <IconButton ref={searchToggle} type="button" aria-label={searchOpen ? "마디 검색 닫기" : "마디 검색 열기"} aria-expanded={searchOpen} aria-controls={searchId}
          onClick={() => { if (searchOpen) closeSearch(); else setSearchOpen(true); }}>
          {searchOpen ? <X size={20} aria-hidden="true" /> : <Search size={20} aria-hidden="true" />}
        </IconButton>}
        <AddButton
          type="button"
          aria-label="마디 남기기"
          onClick={onCreateEntry}
        >
          <Plus size={22} aria-hidden="true" />
        </AddButton>
        </HeaderTools>
      </ListHeader>

      {allEntries.length > 0 && <SearchReveal id={searchId} $open={searchOpen} aria-hidden={!searchOpen} inert={!searchOpen}
        onKeyDown={event => { if (event.key === "Escape" && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); closeSearch(); } }}>
        <div><MadiSearchField inputRef={searchInput} value={search} onChange={setSearch} /></div>
      </SearchReveal>}
      {onlyUnfiled && <ActiveFilter type="button" aria-label="아직 담지 않은 마디 필터 해제" onClick={() => onChangeFilter?.(false)}>아직 담지 않은 마디<X size={13} aria-hidden="true" /></ActiveFilter>}
      {isError && allEntries.length > 0 && <MadiLoadNotice compact busy={isFetching} onRetry={() => void refetch()} />}

      {allEntries.length > 0 && onlyUnfiled && unfiled === null ? <EmptyState>{library.isError ? <><p>담긴 하루마디를 확인하지 못했어요.</p><TextButton onClick={() => void library.refetch()}>다시 확인하기</TextButton></> : <LoadingIndicator label="담긴 하루마디를 확인하고 있어요." />}</EmptyState> : entries.length > 0 && (search.trim() || view === "list") ? <MadiSearchResults entries={entries} selectedId={selectedEntryId} selectedRef={selectedCardRef} label={search.trim() ? "마디 검색 결과" : "마디 목록"}
        onCollect={setCollectEntryId} onOpen={(entry, target) => { setActiveJournalEntry(entry.id); onOpenEntry?.(entry.id, entry.image, target); }} /> : entries.length > 0 ? (
        <MemoryStack
          ref={stackRef}
          role="region"
          tabIndex={0}
          aria-label="남겨둔 마디"
          onKeyDown={event => {
            if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || !event.currentTarget.contains(event.target as Node)) return;
            if (event.key !== "ArrowUp" && event.key !== "ArrowDown" && event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            moveStack(event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 1);
          }}
          onWheel={scrollStack}
          onPointerDown={startStackDrag}
          onPointerMove={updateStackDrag}
          onPointerUp={finishStackDrag}
          onPointerCancel={cancelStackDrag}
        >
          {entries.map((entry, index) => {
            const preview = journalCardPreview(entry);
            const relativePosition = getCircularOffset(
              index,
              selectedEntryIndex,
              entries.length,
            );

            if (Math.abs(relativePosition) > MEMORY_CARD_RADIUS) return null;

            return (
              <MemoryCardLayer
                key={entry.id}
                $relativePosition={relativePosition}
                $dragY={stackDragY}
                $active={index === selectedEntryIndex}
                $rotation={[0.4, -1.2, 1.6, -1.8, 1][index % 5] ?? 0}
              >
                <MemoryCard
                  ref={
                    index === selectedEntryIndex
                      ? selectedCardRef
                      : undefined
                  }
                  type="button"
                  $image={entry.image ?? undefined}
                  $active={index === selectedEntryIndex}
                  $tone={[0, 1, 2, 1, 0][index % 5] ?? 0}
                  aria-label={
                    (!entry.image ? preview.heading || preview.excerpt : entry.title) ||
                    `${formatJournalDate(entry.visitedAt)} 마디`
                  }
                  aria-pressed={index === selectedEntryIndex}
                  tabIndex={index === selectedEntryIndex ? 0 : -1}
                  data-journal-transition-entry-id={entry.id}
                  data-journal-transition-image={entry.image ?? undefined}
                  data-journal-transition-surface="journal"
                  onClick={(event) => {
                    if (!suppressCardClick.current) {
                      if (index === selectedEntryIndex) {
                        onOpenEntry?.(
                          entry.id,
                          entry.image,
                          event.currentTarget,
                        );
                      } else {
                        setActiveJournalEntry(entry.id);
                      }
                    }
                  }}
                >
                  {index === selectedEntryIndex && (
                    <CardHeader $textOnly={!entry.image}>
                      <strong>{formatJournalDate(entry.visitedAt)}</strong>
                    </CardHeader>
                  )}
                  {!entry.image && <TextCardContent>
                    {preview.heading && <TextCardTitle>{preview.heading}</TextCardTitle>}
                    {preview.excerpt && <TextCardExcerpt $lead={!preview.heading}>{preview.excerpt}</TextCardExcerpt>}
                    {preview.place && <TextCardPlace><TutiPlaceIcon $size="small" aria-hidden="true" /><span>{preview.place}</span></TextCardPlace>}
                  </TextCardContent>}
                </MemoryCard>

                {index === selectedEntryIndex && (
                  <CardMenuPosition>
                    <ContextMenu
                      label={`${entry.title || preview.heading || "남겨둔 이야기"} 마디 메뉴`}
                      tone={entry.image ? "inverse" : "default"}
                      items={[
                        {
                          label: "상세 보기",
                          onSelect: () => {
                            if (selectedCardRef.current) {
                              onOpenEntry?.(
                                entry.id,
                                entry.image,
                                selectedCardRef.current,
                              );
                            }
                          },
                        },
                        {
                          label: "하루마디에 담기",
                          onSelect: () => setCollectEntryId(entry.id),
                        },
                        {
                          label: "수정하기",
                          onSelect: () => onEditEntry?.(entry.id),
                        },
                        {
                          label: "마디 공유하기",
                          onSelect: () => setShareEntryId(entry.id),
                        },
                        {
                          label: "삭제하기",
                          tone: "danger",
                          onSelect: () => deleteEntry(entry.id),
                        },
                      ]}
                    />
                  </CardMenuPosition>
                )}
              </MemoryCardLayer>
            );
          })}
        </MemoryStack>
      ) : allEntries.length > 0 ? (
        <EmptyState>
          <p role="status">{onlyUnfiled && !search.trim() ? "모든 마디를 하루마디에 담았어요." : "검색한 마디가 없어요."}</p>
          <TextButton type="button" onClick={() => { closeSearch(); onChangeFilter?.(false); }}>전체 마디 보기</TextButton>
        </EmptyState>
      ) : isPending ? (
        <EmptyState>
          <LoadingIndicator label="마디를 불러오고 있어요." />
        </EmptyState>
      ) : isError ? (
        <EmptyState><MadiLoadNotice busy={isFetching} onRetry={() => void refetch()} /></EmptyState>
      ) : (
        <EmptyState>
          <p>사진 한 장, 짧은 이야기로<br />첫 마디를 남겨보세요.</p>
          {onCreateEntry && <TextButton type="button" onClick={onCreateEntry}>첫 마디 남기기</TextButton>}
        </EmptyState>
      )}
      {entries.length > 0 && !search.trim() && view === "cards" && <AccessibleNavigation aria-label="마디 이동">
        <button type="button" disabled={entries.length < 2} onClick={() => moveStack(-1)}>이전 마디</button>
        <span role="status" aria-live="polite" aria-atomic="true">{selectedEntryIndex + 1} / {entries.length}</span>
        <button type="button" disabled={entries.length < 2} onClick={() => moveStack(1)}>다음 마디</button>
      </AccessibleNavigation>}
      {shareEntry && (
        <JournalShareDialog
          entry={shareEntry}
          publicationEnabled={shareActions.publicationEnabled}
          onClose={() => setShareEntryId(null)}
          onCopyPublicLink={shareActions.copyPublicLink}
          onPublish={shareActions.publish}
          onSharePublicLink={shareActions.sharePublicLink}
          onUnpublish={shareActions.unpublish}
        />
      )}
      {ownerId && collectEntry && <MadiCollectionDialog key={`${ownerId}:${collectEntry.id}`} ownerId={ownerId} entryId={collectEntry.id} onClose={() => setCollectEntryId(null)} />}
    </Frame>
  );
}

const AccessibleNavigation = styled.nav`position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap;
  &:focus-within { z-index: 40; left: var(--screen-padding-left); right: var(--screen-padding-right); bottom: var(--screen-padding-bottom); width: auto; height: auto; clip-path: none; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 12px; background: var(--color-surface); border-radius: 12px; box-shadow: 0 6px 20px #1b222a14;
    > button { min-height: 44px; padding: 8px; font: inherit; color: var(--color-text); background: transparent; border: 0; border-radius: 8px; } }
`;
const ViewMenu = styled(ContextMenu)`> button { min-width: 0; min-height: 44px; padding: 0 2px; display: flex; align-items: center; justify-content: center; gap: 5px; color: var(--color-text); background: transparent; font: inherit; white-space: nowrap; }`;
const HeaderTools = styled.div`display: flex; align-items: center; gap: 0;`;
const IconButton = styled(BaseButton)`flex: none; display: grid; place-items: center; width: 44px; height: 44px; padding: 0; color: var(--color-text-muted); background: transparent; border-radius: 50%; &:focus-visible { outline: 2px solid var(--color-brand-700); outline-offset: -2px; }`;
const SearchReveal = styled.div<{ $open: boolean }>`flex: none; display: grid; grid-template-rows: ${({ $open }) => $open ? "1fr" : "0fr"}; opacity: ${({ $open }) => $open ? 1 : 0}; visibility: ${({ $open }) => $open ? "visible" : "hidden"}; margin-bottom: ${({ $open }) => $open ? "var(--space-5)" : "0"}; transition: grid-template-rows 240ms cubic-bezier(.22,1,.36,1), opacity 180ms ease, visibility 240ms;
  > div { min-height: 0; overflow: hidden; padding: ${({ $open }) => $open ? "2px" : "0 2px"}; }
  @media (prefers-reduced-motion: reduce) { transition: none; }
`;
const ActiveFilter = styled(BaseButton)`display: inline-flex; flex: none; align-items: center; align-self: flex-start; gap: 6px; min-height: 44px; padding: 6px 10px; margin-top: -8px; background: var(--color-brand-100); color: var(--color-brand-1000); border-radius: 999px; font-size: 12px;`;

function formatJournalDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function getCircularOffset(index: number, activeIndex: number, length: number) {
  if (length <= 1) return 0;

  let offset = index - activeIndex;
  const half = Math.floor(length / 2);

  if (offset > half) offset -= length;
  if (offset < -half) offset += length;

  return offset;
}

function getMemoryCardOffset(relativePosition: number) {
  if (relativePosition === 0) return "0px";

  const distance = Math.abs(relativePosition);

  if (relativePosition < 0) {
    return fluidByViewportHeight(
      MEMORY_CARD_GAP_MIN * distance,
      MEMORY_CARD_GAP_MAX * distance,
    );
  }

  return fluidByViewportHeight(
    -MEMORY_CARD_GAP_MIN * distance,
    -MEMORY_CARD_GAP_MAX * distance,
  );
}

const Frame = styled(ScreenFrame)`
  z-index: 1;
  gap: 0;
  background: var(--color-surface);
  overflow: hidden;
`;

const ListHeader = styled.header`
  min-height: var(--space-9);
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 16px;

  h1 {
    margin: 0;
    text-align: center;
    ${screenTitleStyles}
  }

  @container app-viewport (max-width: 360px) {
    gap: 8px;
    h1 { font-size: 20px; }
  }
`;

const AddButton = styled(BaseButton)`
  width: var(--space-11);
  height: var(--space-11);
  display: grid;
  place-items: center;
  padding: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--color-text-muted);
  font-size: calc(var(--font-size-700) + var(--space-2));
  font-weight: 500;
  line-height: 1;
  transition: color 160ms ease, transform 160ms ease;

  &:hover {
    color: var(--color-text);
  }

  &:active {
    transform: scale(0.9);
  }
`;

const EmptyState = styled.div`
  min-height: 0;
  flex: 1;
  display: grid;
  place-items: center;
  padding-bottom: 15%;
  text-align: center;

  p {
    color: var(--color-text);
    font-size: var(--font-size-200);
  }
`;

const MemoryStack = styled.div`
  position: relative;
  min-height: 0;
  flex: 1;
  width: 100%;
  &:focus-visible { outline: 2px solid var(--color-brand-700); outline-offset: -2px; border-radius: 12px; }
`;

const MemoryCardLayer = styled.div<{
  $relativePosition: number;
  $dragY: number;
  $active: boolean;
  $rotation: number;
}>`
  position: absolute;
  top: 50%;
  left: 50%;
  width: min(100%, ${journalImageMaxWidth}px);
  aspect-ratio: 4 / 3;
  opacity: ${({ $relativePosition }) =>
    1 - Math.min(Math.abs($relativePosition) * 0.1, 0.32)};
  transform: translate(-50%, -50%)
    translateY(
      ${({ $relativePosition, $dragY }) =>
        `calc(${getMemoryCardOffset($relativePosition)} + ${$dragY * 0.28}px)`}
    )
    scale(
      ${({ $relativePosition }) =>
        1 - Math.min(Math.abs($relativePosition) * 0.025, 0.08)}
    )
    rotate(${({ $active, $rotation }) => ($active ? 0 : $rotation)}deg);
  z-index: ${({ $relativePosition }) => 20 - Math.abs($relativePosition)};
  transition: transform 320ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 240ms ease;
  touch-action: none;
  will-change: transform;

  @container app-viewport (min-width: 600px) and (min-height: 700px) {
    width: min(78%, 480px);
  }
`;

const MemoryCard = styled(BaseButton)<{
  $image?: string;
  $active: boolean;
  $tone: number;
}>`
  position: relative;
  width: 100%;
  height: 100%;
  display: block;
  overflow: hidden;
  padding: var(--space-5);
  border: 0;
  border-radius: 28px;
  background-color: ${({ $image, $tone }) =>
    !$image
      ? $tone === 1 ? "var(--color-brand-100)" : "var(--color-secondary-100)"
      : $tone === 0
      ? "var(--color-secondary-500)"
      : $tone === 1
        ? "var(--color-brand-500)"
        : "var(--color-secondary-200)"};
  background-image: ${({ $image }) =>
    $image
      ? `linear-gradient(180deg, rgb(var(--color-black-rgb) / 0.42), transparent 38%), url(${$image})`
      : "none"};
  background-position: center;
  background-size: cover;
  color: ${({ $image }) => $image ? "var(--color-white)" : "var(--color-text)"};
  cursor: pointer;
  text-align: left;
  box-shadow: ${({ $active, $image }) =>
    !$image
      ? $active ? "0 12px 30px rgb(28 66 104 / 0.12)" : "0 6px 16px rgb(28 66 104 / 0.08)"
      : $active
      ? "0 18px 42px rgb(var(--color-black-rgb) / 0.24)"
      : "0 8px 20px rgb(var(--color-black-rgb) / 0.16)"};
  transition: box-shadow 240ms ease;
`;

const CardHeader = styled.header<{ $textOnly: boolean }>`
  position: absolute;
  top: var(--space-5);
  right: var(--space-5);
  left: var(--space-5);
  display: flex;
  align-items: center;

  strong {
    font-size: ${({ $textOnly }) => $textOnly ? "12px" : "var(--font-size-300)"};
    font-weight: ${({ $textOnly }) => $textOnly ? 500 : 600};
    ${({ $textOnly }) => $textOnly && "color: var(--color-brand-800); letter-spacing: 0.06em;"}
  }
`;

const TextCardContent = styled.span`
  position: absolute; top: 64px; left: var(--space-5); right: var(--space-5); bottom: var(--space-5);
  display: flex; flex-direction: column; gap: 12px; min-width: 0; overflow: hidden;
  text-align: left; word-break: keep-all; overflow-wrap: anywhere;
  @container app-viewport (max-width: 340px) { gap: 8px; }
`;
const TextCardTitle = styled.span`
  flex: none; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2;
  overflow: hidden; font-size: 20px; font-weight: 600; line-height: 1.45; letter-spacing: -0.025em;
  @container app-viewport (max-width: 340px) { font-size: 16px; }
`;
const TextCardExcerpt = styled.span<{ $lead: boolean }>`
  flex: none; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2;
  overflow: hidden; font-size: 13px; font-weight: 400; line-height: 1.8; color: var(--color-text-muted);
  @container app-viewport (max-width: 340px) { font-size: 12px; -webkit-line-clamp: 2; }
  ${({ $lead }) => $lead && css`
    -webkit-line-clamp: 4; font-size: 19px; font-weight: 500; line-height: 1.65;
    letter-spacing: -0.02em; color: var(--color-text);
    @container app-viewport (max-width: 340px) { font-size: 16px; -webkit-line-clamp: 4; }
  `}
`;
const TextCardPlace = styled.span`
  flex: none; margin-top: auto; display: flex; align-items: center; gap: 6px; min-width: 0;
  font-size: 11px; font-weight: 500; line-height: 1.5; color: var(--color-text-muted);
  > span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`;

const CardMenuPosition = styled.div`
  position: absolute;
  top: var(--space-1);
  right: var(--space-1);
  z-index: 2;
`;
