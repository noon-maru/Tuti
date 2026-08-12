"use client";

import styled from "@emotion/styled";
import { Bookmark, Navigation, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BaseButton,
  PrimaryButton,
} from "@/features/tuti/components/buttons";
import { useDeferredAnimationStart } from "@/features/tuti/hooks/useDeferredAnimationStart";
import type { SavedDeparturePlace } from "@/store/tuti";

const TRANSITION_DURATION = 380;
const DISMISS_THRESHOLD = 72;

export function SavedDeparturePlacesSheet({
  places,
  onOpen,
  onRemove,
  onClose,
}: {
  places: SavedDeparturePlace[];
  onOpen: (place: SavedDeparturePlace) => void;
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
          aria-label="다음에 갈 곳 바텀시트 움직이기"
          onPointerDown={startDrag}
          onPointerMove={updateDrag}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
        >
          <i aria-hidden="true" />
        </DragHandle>

        <Header>
          <div>
            <small>부담 없이 남겨둔 곳</small>
            <h2 id="saved-departure-title">다음에 갈 곳</h2>
          </div>
        </Header>

        {places.length ? (
          <PlaceList data-scroll-region>
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
                      "다음에 가볍게 만나볼 수 있도록 남겨둔 곳"}
                  </p>
                </PlaceCopy>
                <RemoveButton
                  type="button"
                  aria-label={`${place.placeName} 다음에 갈 곳에서 삭제`}
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
          <EmptyState>
            <Bookmark aria-hidden="true" />
            <strong>아직 남겨둔 곳이 없어요.</strong>
            <p>
              길찾기 후 `다음에 갈 곳으로 남겨두기`를 선택하면 여기에
              모아둘게요.
            </p>
          </EmptyState>
        )}
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-1) var(--space-5) var(--space-5);

  > div {
    display: grid;
    gap: 2px;
  }

  small {
    color: var(--color-text-muted);
    font-size: var(--font-size-100);
  }

  h2 {
    font-size: var(--font-size-500);
    line-height: var(--line-height-heading);
  }
`;

const PlaceList = styled.div`
  min-height: 0;
  display: grid;
  gap: var(--space-3);
  overflow-y: auto;
  padding: 0 var(--space-5)
    calc(var(--space-7) + var(--app-safe-area-bottom, 0px));
  overscroll-behavior: contain;
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
  min-height: var(--space-10);
  grid-column: 2 / -1;
  justify-content: center;
  gap: var(--space-2);
  font-size: var(--font-size-100);

  svg {
    width: 16px;
    height: 16px;
  }
`;

const EmptyState = styled.div`
  min-height: 320px;
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
