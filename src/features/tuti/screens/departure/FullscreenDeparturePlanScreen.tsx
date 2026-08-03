"use client";

import styled from "@emotion/styled";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useDeferredAnimationStart } from "@/features/tuti/hooks/useDeferredAnimationStart";
import { DeparturePlanScreen } from "@/features/tuti/screens/departure/DeparturePlanScreen";
import type { TutiPlace } from "@/lib/recommendations";

const FLIP_DURATION = 680;
const DEPARTURE_FULLSCREEN_HISTORY_KEY = "__tutiDepartureFullscreen";

export type CardTransitionRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function FullscreenDeparturePlanScreen({
  place,
  sourceRect,
  onClose,
}: {
  place: TutiPlace;
  sourceRect: CardTransitionRect;
  onClose: () => void;
}) {
  const animationReady = useDeferredAnimationStart();
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const ownsHistoryEntry = useRef(false);
  const ignoreNextPopState = useRef(false);
  const closeTimer = useRef<number | null>(null);
  const expanded = animationReady && !closing;

  const requestClose = useCallback(
    (removeHistoryEntry: boolean) => {
      if (closingRef.current) return;

      closingRef.current = true;
      setClosing(true);
      closeTimer.current = window.setTimeout(() => {
        closeTimer.current = null;
        const shouldRemoveHistoryEntry =
          removeHistoryEntry && ownsHistoryEntry.current;

        ownsHistoryEntry.current = false;
        onClose();

        if (shouldRemoveHistoryEntry) {
          ignoreNextPopState.current = true;
          window.history.back();
        }
      }, FLIP_DURATION);
    },
    [onClose],
  );

  useLayoutEffect(() => {
    const currentState = getHistoryState();

    if (currentState[DEPARTURE_FULLSCREEN_HISTORY_KEY] !== true) {
      window.history.pushState(
        {
          ...currentState,
          [DEPARTURE_FULLSCREEN_HISTORY_KEY]: true,
        },
        "",
        window.location.href,
      );
    }

    ownsHistoryEntry.current = true;

    const closeFromHistory = (event: PopStateEvent) => {
      if (ignoreNextPopState.current) {
        ignoreNextPopState.current = false;
        return;
      }

      if (
        !ownsHistoryEntry.current ||
        getHistoryState(event.state)[DEPARTURE_FULLSCREEN_HISTORY_KEY] === true
      ) {
        return;
      }

      ownsHistoryEntry.current = false;
      requestClose(false);
    };

    window.addEventListener("popstate", closeFromHistory);
    return () => window.removeEventListener("popstate", closeFromHistory);
  }, [requestClose]);

  useEffect(() => {
    const closeFromEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose(true);
    };

    window.addEventListener("keydown", closeFromEscape);
    return () => window.removeEventListener("keydown", closeFromEscape);
  }, [requestClose]);

  useEffect(
    () => () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
    },
    [],
  );

  return (
    <Scene
      role="dialog"
      aria-modal="true"
      aria-label={`${place.name} 출발 준비`}
      $expanded={expanded}
    >
      <SceneBackdrop $expanded={expanded} />
      <FlipCard $expanded={expanded} $sourceRect={sourceRect}>
        <FrontFace $image={place.image} aria-hidden="true">
          <FrontCopy>
            <small>{place.travelTime}</small>
            <strong>{place.phrase}</strong>
            <em>눌러서 출발 준비</em>
          </FrontCopy>
        </FrontFace>
        <BackFace
          $interactive={expanded}
          aria-hidden={!expanded}
          inert={!expanded}
        >
          <DeparturePlanScreen
            place={place}
            embedded
            onClose={() => requestClose(true)}
          />
        </BackFace>
      </FlipCard>
    </Scene>
  );
}

function getHistoryState(state: unknown = window.history.state) {
  return state && typeof state === "object"
    ? (state as Record<string, unknown>)
    : {};
}

const Scene = styled.section<{ $expanded: boolean }>`
  position: absolute;
  inset: 0;
  z-index: 50;
  overflow: hidden;
  perspective: 1400px;
  pointer-events: auto;
  touch-action: pan-y;
`;

const SceneBackdrop = styled.div<{ $expanded: boolean }>`
  position: absolute;
  inset: 0;
  background: rgb(var(--color-black-rgb) / 0.2);
  opacity: ${({ $expanded }) => ($expanded ? 1 : 0)};
  transition: opacity ${FLIP_DURATION - 120}ms ease;
`;

const FlipCard = styled.div<{
  $expanded: boolean;
  $sourceRect: CardTransitionRect;
}>`
  position: absolute;
  left: ${({ $expanded, $sourceRect }) =>
    $expanded ? "0" : `${$sourceRect.left}px`};
  top: ${({ $expanded, $sourceRect }) =>
    $expanded ? "0" : `${$sourceRect.top}px`};
  width: ${({ $expanded, $sourceRect }) =>
    $expanded ? "100%" : `${$sourceRect.width}px`};
  height: ${({ $expanded, $sourceRect }) =>
    $expanded ? "100%" : `${$sourceRect.height}px`};
  border-radius: ${({ $expanded }) => ($expanded ? "0" : "50px")};
  box-shadow: ${({ $expanded }) =>
    $expanded
      ? "0 0 0 rgb(var(--color-black-rgb) / 0)"
      : "0 28px 70px rgb(var(--color-black-rgb) / 0.28)"};
  transform: rotateY(${({ $expanded }) => ($expanded ? 180 : 0)}deg);
  transform-origin: center;
  transform-style: preserve-3d;
  -webkit-transform-style: preserve-3d;
  transition:
    left ${FLIP_DURATION}ms cubic-bezier(0.22, 1, 0.36, 1),
    top ${FLIP_DURATION}ms cubic-bezier(0.22, 1, 0.36, 1),
    width ${FLIP_DURATION}ms cubic-bezier(0.22, 1, 0.36, 1),
    height ${FLIP_DURATION}ms cubic-bezier(0.22, 1, 0.36, 1),
    border-radius ${FLIP_DURATION}ms cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow ${FLIP_DURATION}ms ease,
    transform ${FLIP_DURATION}ms cubic-bezier(0.22, 1, 0.36, 1);
  will-change: left, top, width, height, transform;

  @supports (corner-shape: squircle) {
    corner-shape: squircle;
  }

  @media (prefers-reduced-motion: reduce) {
    transition-duration: 1ms;
  }
`;

const FrontFace = styled.div<{ $image: string }>`
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: var(--space-5);
  overflow: hidden;
  border-radius: inherit;
  background-color: var(--color-accent-secondary);
  background-image:
    linear-gradient(
      180deg,
      transparent 28%,
      rgb(var(--color-black-rgb) / 0.62)
    ),
    ${({ $image }) => `url(${$image})`};
  background-position: center;
  background-size: cover;
  color: var(--color-white);
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
`;

const FrontCopy = styled.div`
  display: grid;
  gap: var(--space-1);

  small {
    color: rgb(var(--color-white-rgb) / 0.88);
    font-size: var(--font-size-100);
  }

  strong {
    font-size: var(--font-size-300);
    line-height: var(--line-height-subtitle);
    letter-spacing: var(--letter-spacing-subtitle);
  }

  em {
    width: fit-content;
    margin-top: var(--space-2);
    padding: var(--space-1) var(--space-3);
    border: 1px solid rgb(var(--color-white-rgb) / 0.34);
    border-radius: 999px;
    background: rgb(var(--color-black-rgb) / 0.14);
    color: rgb(var(--color-white-rgb) / 0.9);
    font-size: calc(var(--font-size-100) - 1px);
    font-style: normal;
    font-weight: 500;
    line-height: var(--line-height-body);
    letter-spacing: var(--letter-spacing-body);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }
`;

const BackFace = styled.div<{ $interactive: boolean }>`
  position: absolute;
  inset: 0;
  overflow: hidden;
  border-radius: inherit;
  background: var(--color-surface);
  transform: rotateY(180deg);
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  pointer-events: ${({ $interactive }) => ($interactive ? "auto" : "none")};
`;
