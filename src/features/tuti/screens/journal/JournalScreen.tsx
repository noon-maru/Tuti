"use client";

import { css, keyframes } from "@emotion/react";
import styled from "@emotion/styled";
import { useRef, useState } from "react";
import {
  useBrowserHistoryEntry,
  useBrowserHistoryExit,
  useHistoryDestinationReveal,
} from "@/features/tuti/components/BrowserHistoryTransition";
import { ContextMenu } from "@/features/tuti/components/ContextMenu";
import { LoadingIndicator } from "@/features/tuti/components/LoadingIndicator";
import { useJournalEntryTransitionTarget } from "@/features/tuti/components/JournalEntryTransition";
import { BaseButton } from "@/features/tuti/components/buttons";
import { ScreenFrame } from "@/features/tuti/components/ScreenFrame";
import { useTutiJournalEntries } from "@/features/tuti/hooks/useTutiJournalEntries";
import { useVerticalSwipeBack } from "@/features/tuti/hooks/useVerticalSwipeBack";
import { shareContent } from "@/lib/shareContent";
import { useTutiStore } from "@/store/tuti";
import {
  fluidByViewportHeight,
  journalImageMaxWidth,
} from "@/styles/tokens";

const MAX_VISIBLE_MEMORY_CARDS = 7;
const MEMORY_CARD_RADIUS = Math.floor(MAX_VISIBLE_MEMORY_CARDS / 2);
const MEMORY_CARD_GAP_MIN = 40;
const MEMORY_CARD_GAP_MAX = 60;
const JOURNAL_EXIT_DURATION = 480;

export function JournalScreen({
  onBack,
  onCreateEntry,
  onEditEntry,
  onOpenEntry,
}: {
  onBack: () => void;
  onCreateEntry?: () => void;
  onEditEntry?: (entryId: string) => void;
  onOpenEntry?: (
    entryId: string,
    image: string | null,
    sourceElement: HTMLElement,
  ) => void;
}) {
  const [stackDragY, setStackDragY] = useState(0);
  const stackPointerStart = useRef<number | null>(null);
  const selectedCardRef = useRef<HTMLButtonElement>(null);
  const wheelLocked = useRef(false);
  const suppressCardClick = useRef(false);
  const {
    entries,
    isPending,
    removeEntry,
  } = useTutiJournalEntries();
  const activeJournalEntryId = useTutiStore(
    (state) => state.activeJournalEntryId,
  );
  const setActiveJournalEntry = useTutiStore(
    (state) => state.setActiveJournalEntry,
  );
  const historyEntry = useBrowserHistoryEntry("/journal");
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
  const revealMainScreen = useHistoryDestinationReveal("/");
  const swipeBack = useVerticalSwipeBack({
    direction: "up",
    onBack,
    onExitStart: revealMainScreen,
    exitDelay: JOURNAL_EXIT_DURATION,
  });

  useBrowserHistoryExit({
    sourcePath: "/journal",
    destinationPath: "/",
    onExit: swipeBack.requestExit,
  });

  const deleteEntry = async (entryId: string) => {
    if (!window.confirm("이 기록을 삭제할까요?")) return;

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
      window.alert(
        error instanceof Error
          ? error.message
          : "기록을 삭제하지 못했어요.",
      );
    }
  };

  const moveStack = (direction: number) => {
    if (!entries.length) return;

    const nextIndex =
      (selectedEntryIndex + direction + entries.length) % entries.length;

    setActiveJournalEntry(entries[nextIndex].id);
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
    <Frame
      {...swipeBack.gestureProps}
      $dragY={swipeBack.dragY}
      $progress={swipeBack.dragProgress}
      $isDragging={swipeBack.isDragging}
      $isEntering={historyEntry.isEntering}
      onAnimationEnd={(event) => {
        if (event.currentTarget === event.target) {
          historyEntry.completeEntry();
        }
      }}
    >
      <ListHeader>
        <h1>지나간 공간</h1>
        <AddButton
          type="button"
          aria-label="새로운 공간 남기기"
          onClick={onCreateEntry}
        >
          +
        </AddButton>
      </ListHeader>

      {entries.length > 0 ? (
        <MemoryStack
          aria-label="남긴 공간"
          onWheel={scrollStack}
          onPointerDown={startStackDrag}
          onPointerMove={updateStackDrag}
          onPointerUp={finishStackDrag}
          onPointerCancel={cancelStackDrag}
        >
          {entries.map((entry, index) => {
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
                  $tone={[0, 1, 2, 1, 0][index] ?? 0}
                  aria-label={
                    entry.title ||
                    `${formatJournalDate(entry.visitedAt)} 기록`
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
                    <CardHeader>
                      <strong>{formatJournalDate(entry.visitedAt)}</strong>
                    </CardHeader>
                  )}
                </MemoryCard>

                {index === selectedEntryIndex && (
                  <CardMenuPosition>
                    <ContextMenu
                      label={`${entry.title} 기록 메뉴`}
                      tone="inverse"
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
                          label: "수정하기",
                          onSelect: () => onEditEntry?.(entry.id),
                        },
                        {
                          label: "기록 공유하기",
                          onSelect: () =>
                            shareContent({
                              title: entry.title,
                              text: entry.content,
                            }),
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
      ) : isPending ? (
        <EmptyState>
          <LoadingIndicator label="지난 공간을 불러오고 있어요." />
        </EmptyState>
      ) : (
        <EmptyState>
          <p>여행에 대한 공기를 남겨보세요 :)</p>
        </EmptyState>
      )}
    </Frame>
  );
}

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

const enterFromHistory = keyframes`
  from {
    opacity: 0.68;
    transform: translateY(-100%) scale(0.975);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
`;

const Frame = styled(ScreenFrame)<{
  $dragY?: number;
  $progress?: number;
  $isDragging?: boolean;
  $isEntering?: boolean;
}>`
  z-index: 1;
  gap: var(--space-7);
  background: var(--color-surface);
  opacity: ${({ $progress = 0 }) => 1 - $progress * 0.32};
  transform: translateY(${({ $dragY = 0 }) => $dragY}px)
    scale(${({ $progress = 0 }) => 1 - $progress * 0.025});
  transition: ${({ $isDragging = false }) =>
    $isDragging
      ? "none"
      : `opacity ${JOURNAL_EXIT_DURATION}ms cubic-bezier(0.22, 1, 0.36, 1),
         transform ${JOURNAL_EXIT_DURATION}ms cubic-bezier(0.22, 1, 0.36, 1)`};
  animation: ${({ $isEntering = false }) =>
    $isEntering
      ? css`${enterFromHistory} ${JOURNAL_EXIT_DURATION}ms cubic-bezier(0.22, 1, 0.36, 1) both`
      : "none"};
  overflow: hidden;
  touch-action: none;
`;

const ListHeader = styled.header`
  min-height: var(--space-9);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);

  h1 {
    font-size: var(--font-size-500);
    font-weight: 700;
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
  background-color: ${({ $tone }) =>
    $tone === 0
      ? "var(--color-secondary-500)"
      : $tone === 1
        ? "var(--color-brand-500)"
        : "var(--color-secondary-200)"};
  background-image: ${({ $image }) =>
    $image
      ? `linear-gradient(180deg, rgb(var(--color-black-rgb) / 0.42), transparent 38%), url(${$image})`
      : "linear-gradient(180deg, rgb(var(--color-black-rgb) / 0.42), transparent 38%)"};
  background-position: center;
  background-size: cover;
  color: var(--color-white);
  cursor: pointer;
  text-align: left;
  box-shadow: ${({ $active }) =>
    $active
      ? "0 18px 42px rgb(var(--color-black-rgb) / 0.24)"
      : "0 8px 20px rgb(var(--color-black-rgb) / 0.16)"};
  transition: box-shadow 240ms ease;
`;

const CardHeader = styled.header`
  position: absolute;
  top: var(--space-5);
  right: var(--space-5);
  left: var(--space-5);
  display: flex;
  align-items: center;

  strong {
    font-size: var(--font-size-300);
    font-weight: 600;
  }
`;

const CardMenuPosition = styled.div`
  position: absolute;
  top: var(--space-1);
  right: var(--space-1);
  z-index: 2;
`;
