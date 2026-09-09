"use client";

import styled from "@emotion/styled";
import { Bookmark, Navigation, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BaseButton,
  PrimaryButton,
} from "@/features/tuti/components/buttons";
import { useDeferredAnimationStart } from "@/features/tuti/hooks/useDeferredAnimationStart";
import type { TutiPlace } from "@/lib/recommendations";
import type { SavedDeparturePlace } from "@/store/tuti";

const TRANSITION_DURATION = 380;
const DISMISS_THRESHOLD = 72;

export function SavedDeparturePlacesSheet({
  places,
  similarPlaces,
  similarPlacesLoading,
  similarPlacesError,
  hasJournalEntries,
  onOpen,
  onOpenSimilar,
  onRetrySimilar,
  onRemove,
  onClose,
}: {
  places: SavedDeparturePlace[];
  similarPlaces: TutiPlace[];
  similarPlacesLoading: boolean;
  similarPlacesError: boolean;
  hasJournalEntries: boolean;
  onOpen: (place: SavedDeparturePlace) => void;
  onOpenSimilar: (place: TutiPlace) => void;
  onRetrySimilar: () => void;
  onRemove: (placeId: string) => void;
  onClose: () => void;
}) {
  const animationReady = useDeferredAnimationStart();
  const [closing, setClosing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dragY, setDragY] = useState(0);
  const dragStartY = useRef<number | null>(null);
  const activePointerId = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);
  const closingRef = useRef(false);

  const closeWith = useCallback((callback: () => void) => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    closeTimer.current = window.setTimeout(callback, TRANSITION_DURATION);
  }, []);

  useEffect(() => {
    const closeFromEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeWith(onClose);
    };
    window.addEventListener("keydown", closeFromEscape);
    return () => window.removeEventListener("keydown", closeFromEscape);
  }, [closeWith, onClose]);

  useEffect(
    () => () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
    },
    [],
  );

  const startDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (closing || !event.isPrimary || event.button !== 0) return;
    dragStartY.current = event.clientY;
    activePointerId.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const updateDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (
      activePointerId.current !== event.pointerId ||
      dragStartY.current === null
    ) {
      return;
    }

    const distance = event.clientY - dragStartY.current;
    setDragY(distance >= 0 ? distance : distance * 0.14);
  };

  const finishDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (
      activePointerId.current !== event.pointerId ||
      dragStartY.current === null
    ) {
      return;
    }

    const distance = Math.max(0, event.clientY - dragStartY.current);
    dragStartY.current = null;
    activePointerId.current = null;
    setDragging(false);

    if (distance >= DISMISS_THRESHOLD) {
      closeWith(onClose);
      return;
    }
    setDragY(0);
  };

  return (
    <Overlay
      $visible={animationReady && !closing}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) closeWith(onClose);
      }}
    >
      <Sheet
        role="dialog"
        aria-modal="true"
        aria-labelledby="saved-departure-title"
        $visible={animationReady}
        $closing={closing}
        $dragging={dragging}
        $dragY={dragY}
      >
        <DragHandle
          type="button"
          aria-label="다음에 갈 공간 바텀시트 움직이기"
          onPointerDown={startDrag}
          onPointerMove={updateDrag}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
        >
          <i aria-hidden="true" />
        </DragHandle>

        <Header>
          <h2 id="saved-departure-title">다음에 갈 공간</h2>
        </Header>

        <SheetBody data-scroll-region>
          <SectionHeader>
            <h3>내가 남겨둔 공간</h3>
          </SectionHeader>

          {places.length ? (
            <PlaceList>
              {places.map((place) => (
                <PlaceItem key={place.placeId}>
                  <PlaceImage
                    $image={place.placeImage}
                    aria-hidden="true"
                  />
                  <PlaceCopy>
                    <small>{formatSavedDate(place.savedAt)}</small>
                    <strong>{place.placeName}</strong>
                    <p>
                      {place.placePhrase ||
                        "다음에 가볍게 만나볼 수 있도록 남겨둔 공간"}
                    </p>
                  </PlaceCopy>
                  <RemoveButton
                    type="button"
                    aria-label={`${place.placeName} 다음에 갈 공간에서 삭제`}
                    onClick={() => onRemove(place.placeId)}
                  >
                    <Trash2 aria-hidden="true" />
                  </RemoveButton>
                  <OpenButton
                    type="button"
                    onClick={() => closeWith(() => onOpen(place))}
                  >
                    출발 준비
                    <Navigation aria-hidden="true" />
                  </OpenButton>
                </PlaceItem>
              ))}
            </PlaceList>
          ) : (
            <EmptyState $compact>
              <Bookmark aria-hidden="true" />
              <strong>아직 남겨둔 공간이 없어요.</strong>
              <p>
                장소 소개 메뉴에서 다음에 갈 공간에 추가를 선택하면 여기에
                모아둘게요.
              </p>
            </EmptyState>
          )}

          <SectionDivider />

          <SectionHeader>
            <h3>다녀온 공간과 닮은 곳</h3>
          </SectionHeader>

          {similarPlacesLoading ? (
            <SimilarStatus>기록에서 닮은 공간을 찾고 있어요.</SimilarStatus>
          ) : similarPlacesError ? (
            <SimilarStatus>
              기록을 불러오지 못했어요.
              <RetryButton type="button" onClick={onRetrySimilar}>
                다시 찾기
              </RetryButton>
            </SimilarStatus>
          ) : similarPlaces.length ? (
            <SimilarList>
              {similarPlaces.map((place) => (
                <SimilarItem key={place.id}>
                  <PlaceImage $image={place.image} aria-hidden="true" />
                  <PlaceCopy>
                    <small>오늘 추천 중에서</small>
                    <strong>{place.name}</strong>
                    <p>{place.cardPhrase ?? place.phrase}</p>
                  </PlaceCopy>
                  <SimilarOpenButton
                    type="button"
                    onClick={() => closeWith(() => onOpenSimilar(place))}
                  >
                    출발 준비
                    <Navigation aria-hidden="true" />
                  </SimilarOpenButton>
                </SimilarItem>
              ))}
            </SimilarList>
          ) : (
            <SimilarStatus>
              {hasJournalEntries
                ? "오늘 추천 중에는 기록과 닮은 공간이 없어요. 다음 추천에서 다시 찾아볼게요."
                : "공간이 기록되면 그날의 테마와 닮은 오늘의 추천을 골라드릴게요."}
            </SimilarStatus>
          )}
        </SheetBody>
      </Sheet>
    </Overlay>
  );
}

function formatSavedDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "남겨둔 장소";

  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
  }).format(date);
}

const Overlay = styled.div<{ $visible: boolean }>`
  position: absolute;
  z-index: 75;
  inset: 0;
  display: grid;
  align-items: end;
  background: rgb(var(--color-black-rgb) / 0.24);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  opacity: ${({ $visible }) => ($visible ? 1 : 0)};
  transition: opacity ${TRANSITION_DURATION}ms ease;
`;

const Sheet = styled.section<{
  $visible: boolean;
  $closing: boolean;
  $dragging: boolean;
  $dragY: number;
}>`
  width: 100%;
  max-height: calc(86% - var(--app-safe-area-top, 0px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 30px 30px 0 0;
  background: var(--color-surface);
  box-shadow: 0 -18px 56px rgb(var(--color-black-rgb) / 0.18);
  transform: translateY(
    ${({ $visible, $closing, $dragY }) =>
      !$visible || $closing ? "calc(100% + 32px)" : `${$dragY}px`}
  );
  transition: ${({ $dragging }) =>
    $dragging
      ? "none"
      : `transform ${TRANSITION_DURATION}ms cubic-bezier(0.22, 1, 0.36, 1)`};

  @supports (corner-shape: squircle) {
    border-radius: 42px 42px 0 0;
    corner-shape: squircle;
  }
`;

const DragHandle = styled(BaseButton)`
  width: 80px;
  height: 30px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  margin-inline: auto;
  background: transparent;
  cursor: grab;
  touch-action: none;

  i {
    width: 42px;
    height: 4px;
    border-radius: 999px;
    background: var(--color-neutral-500);
  }
`;

const Header = styled.header`
  padding: var(--space-1) var(--space-5) var(--space-5);

  h2 {
    font-size: var(--font-size-500);
    line-height: var(--line-height-heading);
  }
`;

const SheetBody = styled.div`
  min-height: 0;
  display: grid;
  align-content: start;
  gap: var(--space-3);
  overflow-y: auto;
  padding: 0 var(--space-5)
    calc(var(--space-7) + var(--app-safe-area-bottom, 0px));
  overscroll-behavior: contain;
`;

const SectionHeader = styled.header`
  h3 {
    font-size: var(--font-size-300);
    line-height: var(--line-height-heading);
  }
`;

const SectionDivider = styled.hr`
  width: 100%;
  height: 1px;
  margin: var(--space-3) 0;
  border: 0;
  background: var(--color-neutral-300);
`;

const PlaceList = styled.div`
  display: grid;
  gap: var(--space-3);
`;

const PlaceItem = styled.article`
  display: grid;
  grid-template-columns: var(--space-16) minmax(0, 1fr) var(--space-9);
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
  border: 1px solid var(--color-neutral-300);
  border-radius: 24px;
  background: linear-gradient(
    135deg,
    var(--color-surface),
    var(--color-secondary-100)
  );
`;

const PlaceImage = styled.div<{ $image?: string }>`
  width: var(--space-16);
  aspect-ratio: 1;
  grid-row: 1 / span 2;
  align-self: start;
  border-radius: 18px;
  background-color: var(--color-accent-soft);
  background-image: ${({ $image }) => ($image ? `url(${$image})` : "none")};
  background-position: center;
  background-size: cover;
`;

const PlaceCopy = styled.div`
  min-width: 0;
  display: grid;
  gap: 2px;

  small {
    color: var(--color-brand-800);
    font-size: calc(var(--font-size-100) - 1px);
  }

  strong {
    overflow: hidden;
    font-size: var(--font-size-200);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  p {
    display: -webkit-box;
    overflow: hidden;
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
    line-height: var(--line-height-body);
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }
`;

const RemoveButton = styled(BaseButton)`
  width: var(--space-9);
  height: var(--space-9);
  align-self: start;
  display: grid;
  place-items: center;
  padding: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--color-text-muted);

  svg {
    width: 17px;
    height: 17px;
  }
`;

const OpenButton = styled(PrimaryButton)`
  width: 100%;
  min-height: var(--space-10);
  grid-column: 2 / -1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: 0 var(--space-4);
  font-size: var(--font-size-100);
  white-space: nowrap;

  svg {
    width: 16px;
    height: 16px;
  }
`;

const SimilarList = styled.div`
  display: grid;
  gap: var(--space-3);
`;

const SimilarItem = styled.article`
  display: grid;
  grid-template-columns: var(--space-16) minmax(0, 1fr);
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
  border: 1px solid var(--color-secondary-300);
  border-radius: 22px;
  background: var(--color-secondary-100);
`;

const SimilarOpenButton = styled(PrimaryButton)`
  width: 100%;
  min-height: var(--space-10);
  grid-column: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: 0 var(--space-4);
  font-size: var(--font-size-100);
  white-space: nowrap;

  svg {
    width: 16px;
    height: 16px;
  }
`;

const SimilarStatus = styled.div`
  display: grid;
  justify-items: center;
  gap: var(--space-3);
  padding: var(--space-5);
  border-radius: 20px;
  background: var(--color-neutral-100);
  color: var(--color-text-muted);
  font-size: var(--font-size-100);
  line-height: var(--line-height-body);
  text-align: center;
`;

const RetryButton = styled(BaseButton)`
  min-height: var(--space-9);
  padding: 0 var(--space-4);
  border: 1px solid var(--color-neutral-400);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-text);
  font-size: var(--font-size-100);
  font-weight: 700;
`;

const EmptyState = styled.div<{ $compact?: boolean }>`
  min-height: ${({ $compact }) => ($compact ? "190px" : "320px")};
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  padding: var(--space-8) var(--space-6)
    calc(var(--space-8) + var(--app-safe-area-bottom, 0px));
  text-align: center;

  > svg {
    width: 44px;
    height: 44px;
    padding: 11px;
    border-radius: 16px;
    background: var(--color-secondary-200);
    color: var(--color-secondary-900);
  }

  strong {
    font-size: var(--font-size-300);
  }

  p {
    max-width: 290px;
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
    line-height: var(--line-height-body);
  }
`;
