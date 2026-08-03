"use client";

import styled from "@emotion/styled";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useDeferredAnimationStart } from "@/features/tuti/hooks/useDeferredAnimationStart";
import { DeparturePlanScreen } from "@/features/tuti/screens/departure/DeparturePlanScreen";
import type { CardTransitionRect } from "@/features/tuti/screens/departure/FullscreenDeparturePlanScreen";
import type { TutiPlace } from "@/lib/recommendations";

const EXPAND_DURATION = 560;
const CONTENT_INTERACTION_DELAY = 430;
const DEPARTURE_EXPANDED_HISTORY_KEY = "__tutiDepartureExpanded";

export function ExpandedDeparturePlanScreen({
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
  const [contentInteractive, setContentInteractive] = useState(false);
  const closingRef = useRef(false);
  const ownsHistoryEntry = useRef(false);
  const ignoreNextPopState = useRef(false);
  const closeTimer = useRef<number | null>(null);
  const interactionTimer = useRef<number | null>(null);
  const expanded = animationReady && !closing;

  const requestClose = useCallback(
    (removeHistoryEntry: boolean) => {
      if (closingRef.current) return;

      closingRef.current = true;
      setContentInteractive(false);
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
      }, EXPAND_DURATION);
    },
    [onClose],
  );

  useLayoutEffect(() => {
    const currentState = getHistoryState();

    if (currentState[DEPARTURE_EXPANDED_HISTORY_KEY] !== true) {
      window.history.pushState(
        {
          ...currentState,
          [DEPARTURE_EXPANDED_HISTORY_KEY]: true,
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
        getHistoryState(event.state)[DEPARTURE_EXPANDED_HISTORY_KEY] === true
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
    if (!expanded) return;

    interactionTimer.current = window.setTimeout(() => {
      interactionTimer.current = null;
      setContentInteractive(true);
    }, CONTENT_INTERACTION_DELAY);

    return () => {
      if (interactionTimer.current) {
        window.clearTimeout(interactionTimer.current);
        interactionTimer.current = null;
      }
    };
  }, [expanded]);

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
      if (interactionTimer.current) {
        window.clearTimeout(interactionTimer.current);
      }
    },
    [],
  );

  return (
    <Scene
      role="dialog"
      aria-modal="true"
      aria-label={`${place.name} 출발 준비`}
    >
      <SceneBackdrop $expanded={expanded} />
      <ExpandedCard $expanded={expanded} $sourceRect={sourceRect}>
        <CardFace
          $image={place.image}
          $expanded={expanded}
          $closing={closing}
          aria-hidden="true"
        >
          <CardCopy>
            <small>{place.travelTime}</small>
            <strong>{place.phrase}</strong>
            <em>눌러서 출발 준비</em>
          </CardCopy>
        </CardFace>
        <ContentLayer
          $visible={expanded}
          $interactive={contentInteractive}
          aria-hidden={!contentInteractive}
          inert={!contentInteractive}
        >
          <DeparturePlanScreen
            place={place}
            embedded
            onClose={() => requestClose(true)}
          />
        </ContentLayer>
      </ExpandedCard>
    </Scene>
  );
}

function getHistoryState(state: unknown = window.history.state) {
  return state && typeof state === "object"
    ? (state as Record<string, unknown>)
    : {};
}

const Scene = styled.section`
  position: absolute;
  inset: 0;
  z-index: 50;
  overflow: hidden;
  pointer-events: auto;
  touch-action: pan-y;
`;

const SceneBackdrop = styled.div<{ $expanded: boolean }>`
  position: absolute;
  inset: 0;
  background: rgb(var(--color-white-rgb) / 0.44);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  opacity: ${({ $expanded }) => ($expanded ? 1 : 0)};
  transition: opacity ${EXPAND_DURATION - 100}ms ease;
`;

const ExpandedCard = styled.div<{
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
  overflow: hidden;
  border-radius: ${({ $expanded }) => ($expanded ? "0" : "32px")};
  background: var(--color-surface);
  box-shadow: ${({ $expanded }) =>
    $expanded
      ? "0 0 0 rgb(var(--color-black-rgb) / 0)"
      : "0 28px 70px rgb(var(--color-black-rgb) / 0.28)"};
  transition:
    left ${EXPAND_DURATION}ms cubic-bezier(0.22, 1, 0.36, 1),
    top ${EXPAND_DURATION}ms cubic-bezier(0.22, 1, 0.36, 1),
    width ${EXPAND_DURATION}ms cubic-bezier(0.22, 1, 0.36, 1),
    height ${EXPAND_DURATION}ms cubic-bezier(0.22, 1, 0.36, 1),
    border-radius ${EXPAND_DURATION}ms cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow ${EXPAND_DURATION}ms ease;
  will-change: left, top, width, height;

  @supports (corner-shape: squircle) {
    border-radius: ${({ $expanded }) => ($expanded ? "0" : "50px")};
    corner-shape: squircle;
  }

  @media (prefers-reduced-motion: reduce) {
    transition-duration: 1ms;
  }
`;

const CardFace = styled.div<{
  $image: string;
  $expanded: boolean;
  $closing: boolean;
}>`
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: var(--space-5);
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
  opacity: ${({ $expanded }) => ($expanded ? 0 : 1)};
  pointer-events: none;
  transition: ${({ $closing }) =>
    $closing
      ? "opacity 210ms ease 40ms"
      : "opacity 190ms ease 250ms"};

  @media (prefers-reduced-motion: reduce) {
    transition-duration: 1ms;
    transition-delay: 0ms;
  }
`;

const CardCopy = styled.div`
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

const ContentLayer = styled.div<{
  $visible: boolean;
  $interactive: boolean;
}>`
  position: absolute;
  inset: 0;
  z-index: 1;
  background: var(--color-surface);
  opacity: ${({ $visible }) => ($visible ? 1 : 0)};
  transform: scale(${({ $visible }) => ($visible ? 1 : 0.985)});
  transform-origin: center;
  pointer-events: ${({ $interactive }) =>
    $interactive ? "auto" : "none"};
  transition:
    opacity 240ms ease ${({ $visible }) => ($visible ? "300ms" : "0ms")},
    transform 320ms cubic-bezier(0.22, 1, 0.36, 1)
      ${({ $visible }) => ($visible ? "250ms" : "0ms")};

  @media (prefers-reduced-motion: reduce) {
    transition-duration: 1ms;
    transition-delay: 0ms;
  }
`;
