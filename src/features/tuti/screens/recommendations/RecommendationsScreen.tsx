"use client";

import styled from "@emotion/styled";
import { useCallback, useEffect, useState } from "react";
import { BaseButton } from "@/features/tuti/components/buttons";
import { ScreenFrame } from "@/features/tuti/components/ScreenFrame";
import { SwipeCard } from "@/features/tuti/components/SwipeCard";
import { DetailScreen } from "@/features/tuti/screens/detail/DetailScreen";
import { JournalScreen } from "@/features/tuti/screens/journal/JournalScreen";
import type { TutiPlace } from "@/lib/recommendations";

type Point = { x: number; y: number };
type DragAxis = "horizontal" | "vertical" | null;
type HelpKind = "detail" | "journal";

export function RecommendationsScreen({
  places,
  activeIndex,
  activePlace,
  onSelect,
  onMove,
  onDetail,
  onJournal,
  interactive,
  initialHelp,
  onInitialHelpShown,
}: {
  places: TutiPlace[];
  activeIndex: number;
  activePlace?: TutiPlace;
  onSelect: (index: number) => void;
  onMove: (direction: number) => void;
  onDetail: () => void;
  onJournal: () => void;
  interactive: boolean;
  initialHelp: HelpKind | null;
  onInitialHelpShown: (kind: HelpKind) => void;
}) {
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [dragOffset, setDragOffset] = useState<Point>({ x: 0, y: 0 });
  const [dragAxis, setDragAxis] = useState<DragAxis>(null);
  const [committing, setCommitting] = useState(false);
  const [nudgingCard, setNudgingCard] = useState<"up" | "down" | null>(null);
  const [pressedCardIndex, setPressedCardIndex] = useState<number | null>(null);
  const [currentHelp, setCurrentHelp] = useState<HelpKind | null>(null);
  const [displayedHelp, setDisplayedHelp] = useState<HelpKind | null>(null);
  const verticalProgress =
    dragAxis === "vertical" ? Math.min(Math.abs(dragOffset.y) / 140, 1) : 0;
  const transitionTarget = dragOffset.y < 0 ? "detail" : "journal";
  const helpVisible =
    interactive && Boolean(currentHelp) && verticalProgress === 0 && !committing;

  const resetDrag = useCallback(() => {
    setDragStart(null);
    setDragOffset({ x: 0, y: 0 });
    setDragAxis(null);
    setCommitting(false);
    setPressedCardIndex(null);
  }, []);

  const nudgeActiveCard = useCallback((direction: "up" | "down" = "up") => {
    if (committing) return;

    setNudgingCard(null);
    window.setTimeout(() => {
      setNudgingCard(direction);
      window.setTimeout(() => setNudgingCard(null), 560);
    }, 0);
  }, [committing]);

  const dismissHelp = useCallback(() => {
    if (!currentHelp) return;

    onInitialHelpShown(currentHelp);
    setCurrentHelp(null);
  }, [currentHelp, onInitialHelpShown]);

  useEffect(() => {
    if (!initialHelp || currentHelp || dragStart || committing || verticalProgress > 0) {
      return undefined;
    }

    const showTimeout = window.setTimeout(() => {
      setCurrentHelp(initialHelp);
      setDisplayedHelp(initialHelp);
      nudgeActiveCard(initialHelp === "journal" ? "down" : "up");
    }, 260);

    return () => window.clearTimeout(showTimeout);
  }, [initialHelp, currentHelp, dragStart, committing, verticalProgress, nudgeActiveCard]);

  useEffect(() => {
    if (!currentHelp) {
      return undefined;
    }

    const timeout = window.setTimeout(dismissHelp, 4200);

    return () => window.clearTimeout(timeout);
  }, [currentHelp, dismissHelp]);

  useEffect(() => {
    if (interactive) return;

    resetDrag();
    setCurrentHelp(null);
    setNudgingCard(null);
  }, [interactive, resetDrag]);

  const startDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (!interactive) return;

    const cardElement = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-swipe-card-index]",
    );
    if (!cardElement) return;

    const point = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragStart(point);
    setDragOffset({ x: 0, y: 0 });
    setDragAxis(null);
    setCommitting(false);
    dismissHelp();
    setPressedCardIndex(Number(cardElement.dataset.swipeCardIndex));
  };

  const updateDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (!dragStart) return;

    const dx = event.clientX - dragStart.x;
    const dy = event.clientY - dragStart.y;
    const nextAxis =
      dragAxis ??
      (Math.abs(dx) > 8 || Math.abs(dy) > 8
        ? Math.abs(dx) >= Math.abs(dy)
          ? "horizontal"
          : "vertical"
        : null);

    if (nextAxis !== dragAxis) {
      setDragAxis(nextAxis);
    }

    if (nextAxis === "vertical") {
      dismissHelp();
    }

    setDragOffset({
      x: nextAxis === "horizontal" ? dx : 0,
      y: nextAxis === "vertical" ? dy : 0,
    });
  };

  const finishDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (!dragStart) return;

    const dx = event.clientX - dragStart.x;
    const dy = event.clientY - dragStart.y;
    const axis = dragAxis ?? (Math.abs(dx) >= Math.abs(dy) ? "horizontal" : "vertical");

    if (Math.abs(dx) < 8 && Math.abs(dy) < 8 && pressedCardIndex !== null) {
      if (pressedCardIndex === activeIndex) {
        nudgeActiveCard();
      } else {
        onSelect(pressedCardIndex);
      }

      resetDrag();
      return;
    }

    if (axis === "horizontal" && Math.abs(dx) > 36) {
      onMove(dx < 0 ? 1 : -1);
      resetDrag();
      return;
    }

    if (axis === "vertical" && Math.abs(dy) > 48) {
      const direction = dy < 0 ? -1 : 1;
      setCommitting(true);
      setDragAxis("vertical");
      setDragStart(null);
      setDragOffset({ x: 0, y: direction * 160 });
      window.setTimeout(() => {
        if (direction < 0) {
          onDetail();
        } else {
          onJournal();
        }
      }, 120);
      return;
    }

    resetDrag();
  };

  const cancelDrag = () => {
    resetDrag();
  };

  return (
    <Frame
      $interactive={interactive}
      aria-hidden={!interactive}
      inert={!interactive}
      onPointerDown={startDrag}
      onPointerMove={updateDrag}
      onPointerUp={finishDrag}
      onPointerCancel={cancelDrag}
    >
      <CurrentLayer $progress={verticalProgress} $dragY={dragOffset.y}>
        <Copy $progress={verticalProgress}>
          <h1>오늘 가능한 정도</h1>
          <p>
            {activePlace?.reason ?? "지금의 마음에 맞는 장소를 찾고 있어요."}
          </p>
        </Copy>
        <Carousel>
          {places.map((place, index) => (
            <SwipeCard
              key={place.id}
              cardIndex={index}
              place={place}
              offset={getOffset(index, activeIndex, places.length)}
              active={index === activeIndex}
              drag={dragStart || committing ? dragOffset : undefined}
              nudging={index === activeIndex ? nudgingCard : null}
              detailProgress={
                index === activeIndex && transitionTarget === "detail"
                  ? verticalProgress
                  : 0
              }
            />
          ))}
        </Carousel>
        <Dots $progress={verticalProgress}>
          {places.map((place, index) => (
            <Dot
              key={place.id}
              type="button"
              aria-label={`${index + 1}번째 카드`}
              aria-pressed={index === activeIndex}
              $active={index === activeIndex}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => onSelect(index)}
            />
          ))}
        </Dots>
      </CurrentLayer>

      {interactive && activePlace && verticalProgress > 0 &&
        (transitionTarget === "detail" ? (
          <DetailTransitionLayer>
            <DetailScreen
              place={activePlace}
              onBack={() => undefined}
              revealProgress={verticalProgress}
            />
          </DetailTransitionLayer>
        ) : (
          <TransitionLayer $progress={verticalProgress} $from={-34}>
            <JournalScreen onBack={() => undefined} />
          </TransitionLayer>
        ))}

      <HelpOverlay $visible={helpVisible} aria-hidden={!helpVisible}>
        {displayedHelp &&
          (displayedHelp === "journal" ? (
            <>
              <p>방금의 공기는</p>
              <strong>아래로 살짝 남겨둘까요?</strong>
            </>
          ) : (
            <>
              <p>괜찮아 보인다면</p>
              <strong>위로 올려볼까요?</strong>
            </>
          ))}
      </HelpOverlay>
    </Frame>
  );
}

function getOffset(index: number, active: number, length: number) {
  const raw = index - active;
  if (raw > length / 2) return raw - length;
  if (raw < -length / 2) return raw + length;
  return raw;
}

const Frame = styled(ScreenFrame)<{ $interactive: boolean }>`
  z-index: 0;
  justify-content: space-between;
  overflow: hidden;
  touch-action: none;
  pointer-events: ${({ $interactive }) => ($interactive ? "auto" : "none")};
  isolation: isolate;
`;

const CurrentLayer = styled.div<{ $progress: number; $dragY: number }>`
  position: absolute;
  inset: var(--screen-padding-top) var(--screen-padding-right)
    var(--screen-padding-bottom) var(--screen-padding-left);
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  transform: translateY(${({ $dragY }) => $dragY * 0.02}px);
  transition: ${({ $progress }) =>
    $progress > 0 ? "none" : "transform 260ms ease"};

`;

const DetailTransitionLayer = styled.div`
  position: absolute;
  inset: 0;
  z-index: 20;
  pointer-events: none;
`;

const TransitionLayer = styled.div<{ $progress: number; $from: number }>`
  position: absolute;
  inset: 0;
  z-index: 20;
  pointer-events: none;
  opacity: ${({ $progress }) => $progress};
  transform: translateY(${({ $progress, $from }) => $from * (1 - $progress)}px);
  transition: ${({ $progress }) =>
    $progress > 0 ? "none" : "opacity 220ms ease, transform 240ms ease"};
`;

const HelpOverlay = styled.div<{ $visible: boolean }>`
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 30;
  height: 25%;
  display: grid;
  align-content: end;
  justify-items: center;
  padding: 0 var(--space-8)
    calc(var(--space-10) + var(--app-safe-area-bottom, 0px));
  background: linear-gradient(
    to top,
    rgb(var(--color-white-rgb) / 1) 0%,
    rgb(var(--color-white-rgb) / 0.82) 46%,
    rgb(var(--color-white-rgb) / 0) 100%
  );
  color: var(--color-text);
  text-align: center;
  pointer-events: none;
  opacity: ${({ $visible }) => ($visible ? 1 : 0)};
  transition: opacity 360ms ease;

  p {
    margin: 0 0 var(--space-1);
    color: var(--color-text-muted);
    font-size: var(--font-size-200);
  }

  strong {
    font-size: var(--font-size-600);
    font-weight: 700;
  }
`;

const Copy = styled.div<{ $progress: number }>`
  display: grid;
  gap: var(--space-2);
  justify-items: center;
  text-align: center;
  opacity: ${({ $progress }) => Math.max(0, 1 - $progress * 2)};
  transform: translateY(${({ $progress }) => $progress * -8}px);
  transition: ${({ $progress }) =>
    $progress > 0 ? "none" : "opacity 220ms ease, transform 240ms ease"};

  h1 {
    font-size: var(--font-size-500);
    font-weight: 600;
    line-height: var(--line-height-subtitle);
    letter-spacing: var(--letter-spacing-subtitle);
  }

  p {
    max-width: 300px;
    color: var(--color-text-muted);
    font-size: var(--font-size-200);
  }
`;

const Carousel = styled.div`
  position: relative;
  height: clamp(480px, calc(60dvh - var(--space-10)), 520px);
  margin-top: clamp(var(--space-8), 6dvh, var(--space-14));
  display: grid;
  place-items: center;
  perspective: 900px;
`;

const Dots = styled.div<{ $progress: number }>`
  width: fit-content;
  min-height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0;
  align-self: center;
  margin-top: auto;
  padding: 0 var(--space-2);
  border-radius: 999px;
  background: rgb(var(--color-white-rgb) / 0.34);
  opacity: ${({ $progress }) => Math.max(0, 1 - $progress * 2)};
  transform: translateY(${({ $progress }) => $progress * 8}px);
  transition: ${({ $progress }) =>
    $progress > 0 ? "none" : "opacity 220ms ease, transform 240ms ease"};
`;

const Dot = styled(BaseButton)<{ $active: boolean }>`
  width: 30px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: transparent;
  touch-action: manipulation;

  &::after {
    content: "";
    width: ${({ $active }) => ($active ? "18px" : "6px")};
    height: 6px;
    border-radius: 999px;
    background: ${({ $active }) =>
      $active ? "var(--color-text)" : "var(--color-border)"};
    transition: width 160ms ease, height 160ms ease, background 160ms ease;
  }
`;
