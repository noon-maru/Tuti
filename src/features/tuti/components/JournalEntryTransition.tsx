"use client";

import styled from "@emotion/styled";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal, flushSync } from "react-dom";

const JOURNAL_ENTRY_MOVE_DURATION = 360;
const JOURNAL_ENTRY_SETTLE_DURATION = 120;
const JOURNAL_ENTRY_WAIT_TIMEOUT = 3000;

type TransitionPhase = "waiting" | "ready" | "moving" | "settling";

type TransitionRect = {
  borderRadius: number;
  height: number;
  left: number;
  top: number;
  width: number;
};

type JournalEntryTransitionState = {
  entryId: string;
  image?: string;
  phase: TransitionPhase;
  source: TransitionRect;
  target?: TransitionRect;
};

type StartTransitionOptions = {
  entryId: string;
  image?: string;
  navigate: () => void;
  sourceElement: HTMLElement;
};

type JournalEntryTransitionContextValue = {
  activeEntryId: string | null;
  phase: TransitionPhase | null;
  registerTarget: (
    entryId: string,
    targetElement: HTMLElement,
  ) => void;
  startTransition: (options: StartTransitionOptions) => void;
};

const JournalEntryTransitionContext =
  createContext<JournalEntryTransitionContextValue>({
    activeEntryId: null,
    phase: null,
    registerTarget: () => undefined,
    startTransition: ({ navigate }) => navigate(),
  });

export function JournalEntryTransitionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [transition, setTransition] =
    useState<JournalEntryTransitionState | null>(null);
  const transitionRef = useRef<JournalEntryTransitionState | null>(null);
  const firstFrame = useRef<number | null>(null);
  const transitionTimer = useRef<number | null>(null);

  const cancelScheduledWork = useCallback(() => {
    if (firstFrame.current) {
      window.cancelAnimationFrame(firstFrame.current);
      firstFrame.current = null;
    }

    if (transitionTimer.current) {
      window.clearTimeout(transitionTimer.current);
      transitionTimer.current = null;
    }
  }, []);

  const clearTransition = useCallback(() => {
    cancelScheduledWork();
    transitionRef.current = null;
    setTransition(null);
  }, [cancelScheduledWork]);

  const startTransition = useCallback(
    ({
      entryId,
      image,
      navigate,
      sourceElement,
    }: StartTransitionOptions) => {
      cancelScheduledWork();

      const nextTransition: JournalEntryTransitionState = {
        entryId,
        image,
        phase: "waiting",
        source: measureElement(sourceElement),
      };

      transitionRef.current = nextTransition;
      flushSync(() => {
        setTransition(nextTransition);
      });
      navigate();

      transitionTimer.current = window.setTimeout(
        clearTransition,
        JOURNAL_ENTRY_WAIT_TIMEOUT,
      );
    },
    [cancelScheduledWork, clearTransition],
  );

  const registerTarget = useCallback(
    (entryId: string, targetElement: HTMLElement) => {
      const currentTransition = transitionRef.current;

      if (
        !currentTransition ||
        currentTransition.entryId !== entryId ||
        currentTransition.target
      ) {
        return;
      }

      cancelScheduledWork();

      const readyTransition: JournalEntryTransitionState = {
        ...currentTransition,
        phase: "ready",
        target: measureElement(targetElement),
      };

      transitionRef.current = readyTransition;
      setTransition(readyTransition);

      firstFrame.current = window.requestAnimationFrame(() => {
        const latestTransition = transitionRef.current;

        if (!latestTransition || latestTransition.entryId !== entryId) {
          return;
        }

        const movingTransition: JournalEntryTransitionState = {
          ...latestTransition,
          phase: "moving",
        };

        firstFrame.current = null;
        transitionRef.current = movingTransition;
        setTransition(movingTransition);

        transitionTimer.current = window.setTimeout(() => {
          const settlingTransition = transitionRef.current;

          if (
            !settlingTransition ||
            settlingTransition.entryId !== entryId
          ) {
            return;
          }

          const nextTransition: JournalEntryTransitionState = {
            ...settlingTransition,
            phase: "settling",
          };

          transitionRef.current = nextTransition;
          setTransition(nextTransition);
          transitionTimer.current = window.setTimeout(
            clearTransition,
            JOURNAL_ENTRY_SETTLE_DURATION,
          );
        }, JOURNAL_ENTRY_MOVE_DURATION);
      });
    },
    [cancelScheduledWork, clearTransition],
  );

  useEffect(() => cancelScheduledWork, [cancelScheduledWork]);

  const contextValue = useMemo<JournalEntryTransitionContextValue>(
    () => ({
      activeEntryId: transition?.entryId ?? null,
      phase: transition?.phase ?? null,
      registerTarget,
      startTransition,
    }),
    [registerTarget, startTransition, transition?.entryId, transition?.phase],
  );

  const displayedRect =
    transition?.phase === "moving" ||
    transition?.phase === "settling"
      ? transition.target ?? transition.source
      : transition?.source;

  return (
    <JournalEntryTransitionContext.Provider value={contextValue}>
      {children}
      {transition &&
        displayedRect &&
        typeof document !== "undefined" &&
        createPortal(
          <TransitionCard
            aria-hidden="true"
            $image={transition.image}
            $phase={transition.phase}
            style={{
              borderRadius: displayedRect.borderRadius,
              height: displayedRect.height,
              left: displayedRect.left,
              top: displayedRect.top,
              width: displayedRect.width,
            }}
          />,
          document.body,
        )}
    </JournalEntryTransitionContext.Provider>
  );
}

export function useJournalEntryTransition() {
  return useContext(JournalEntryTransitionContext);
}

export function useJournalEntryTransitionTarget(
  entryId: string,
  targetRef: RefObject<HTMLElement | null>,
) {
  const { activeEntryId, phase, registerTarget } = useContext(
    JournalEntryTransitionContext,
  );

  useLayoutEffect(() => {
    if (activeEntryId === entryId && targetRef.current) {
      registerTarget(entryId, targetRef.current);
    }
  }, [activeEntryId, entryId, registerTarget, targetRef]);

  return {
    isActive: activeEntryId === entryId,
    isContentVisible:
      activeEntryId !== entryId ||
      phase === "moving" ||
      phase === "settling",
    isSettling: activeEntryId === entryId && phase === "settling",
  };
}

function measureElement(element: HTMLElement): TransitionRect {
  const rect = element.getBoundingClientRect();
  const borderRadius = Number.parseFloat(
    window.getComputedStyle(element).borderTopLeftRadius,
  );

  return {
    borderRadius: Number.isFinite(borderRadius) ? borderRadius : 0,
    height: rect.height,
    left: rect.left,
    top: rect.top,
    width: rect.width,
  };
}

const TransitionCard = styled.div<{
  $image?: string;
  $phase: TransitionPhase;
}>`
  position: fixed;
  z-index: 2147483000;
  overflow: hidden;
  background-color: var(--color-secondary-500);
  background-image: ${({ $image }) =>
    $image ? `url(${$image})` : "none"};
  background-position: center;
  background-size: cover;
  box-shadow: ${({ $phase }) =>
    $phase === "waiting" || $phase === "ready"
      ? "0 18px 42px rgb(var(--color-black-rgb) / 0.24)"
      : "0 0 0 rgb(var(--color-black-rgb) / 0)"};
  opacity: ${({ $phase }) => ($phase === "settling" ? 0 : 1)};
  pointer-events: none;
  transition:
    ${({ $phase }) =>
      $phase === "moving" || $phase === "settling"
        ? `top ${JOURNAL_ENTRY_MOVE_DURATION}ms cubic-bezier(0.22, 1, 0.36, 1),
           left ${JOURNAL_ENTRY_MOVE_DURATION}ms cubic-bezier(0.22, 1, 0.36, 1),
           width ${JOURNAL_ENTRY_MOVE_DURATION}ms cubic-bezier(0.22, 1, 0.36, 1),
           height ${JOURNAL_ENTRY_MOVE_DURATION}ms cubic-bezier(0.22, 1, 0.36, 1),
           border-radius ${JOURNAL_ENTRY_MOVE_DURATION}ms cubic-bezier(0.22, 1, 0.36, 1),
           box-shadow ${JOURNAL_ENTRY_MOVE_DURATION}ms ease`
        : "none"},
    opacity ${JOURNAL_ENTRY_SETTLE_DURATION}ms ease;

  &::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 1;
    border-radius: inherit;
    box-shadow: inset 0 0 0 1px rgb(var(--color-white-rgb) / 0.16);
    opacity: ${({ $phase }) =>
      $phase === "moving" || $phase === "settling" ? 1 : 0};
    transition: opacity ${JOURNAL_ENTRY_MOVE_DURATION}ms ease;
    pointer-events: none;
  }

  &::after {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 2;
    background: linear-gradient(
      180deg,
      rgb(var(--color-black-rgb) / 0.3),
      transparent 38%
    );
    opacity: ${({ $phase }) =>
      $phase === "waiting" || $phase === "ready" ? 1 : 0};
    transition: opacity ${JOURNAL_ENTRY_MOVE_DURATION}ms ease;
    pointer-events: none;
  }
`;
