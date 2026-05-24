"use client";

import styled from "@emotion/styled";
import { useState } from "react";
import { BaseButton } from "@/features/tuti/components/buttons";
import { ScreenFrame } from "@/features/tuti/components/ScreenFrame";
import { SwipeCard } from "@/features/tuti/components/SwipeCard";
import { DetailScreen } from "@/features/tuti/screens/detail/DetailScreen";
import { JournalScreen } from "@/features/tuti/screens/journal/JournalScreen";
import type { TutiPlace } from "@/lib/recommendations";

type Point = { x: number; y: number };
type DragAxis = "horizontal" | "vertical" | null;

export function SwipeScreen({
  places,
  activeIndex,
  activePlace,
  onSelect,
  onMove,
  onDetail,
  onJournal,
}: {
  places: TutiPlace[];
  activeIndex: number;
  activePlace?: TutiPlace;
  onSelect: (index: number) => void;
  onMove: (direction: number) => void;
  onDetail: () => void;
  onJournal: () => void;
}) {
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [dragOffset, setDragOffset] = useState<Point>({ x: 0, y: 0 });
  const [dragAxis, setDragAxis] = useState<DragAxis>(null);
  const [committing, setCommitting] = useState(false);
  const [nudgingCard, setNudgingCard] = useState(false);
  const [pressedCardIndex, setPressedCardIndex] = useState<number | null>(null);
  const verticalProgress =
    dragAxis === "vertical" ? Math.min(Math.abs(dragOffset.y) / 140, 1) : 0;
  const transitionTarget = dragOffset.y < 0 ? "detail" : "journal";

  const startDrag = (event: React.PointerEvent<HTMLElement>) => {
    const point = { x: event.clientX, y: event.clientY };
    const cardElement = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-swipe-card-index]",
    );

    event.currentTarget.setPointerCapture(event.pointerId);
    setDragStart(point);
    setDragOffset({ x: 0, y: 0 });
    setDragAxis(null);
    setCommitting(false);
    setPressedCardIndex(
      cardElement ? Number(cardElement.dataset.swipeCardIndex) : null,
    );
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
          return;
        }

        onJournal();
      }, 120);
      return;
    }

    resetDrag();
  };

  const cancelDrag = () => {
    resetDrag();
  };

  const nudgeActiveCard = () => {
    if (committing) return;

    setNudgingCard(false);
    window.setTimeout(() => {
      setNudgingCard(true);
      window.setTimeout(() => setNudgingCard(false), 560);
    }, 0);
  };

  const resetDrag = () => {
    setDragStart(null);
    setDragOffset({ x: 0, y: 0 });
    setDragAxis(null);
    setCommitting(false);
    setPressedCardIndex(null);
  };

  return (
    <Frame
      onPointerDown={startDrag}
      onPointerMove={updateDrag}
      onPointerUp={finishDrag}
      onPointerCancel={cancelDrag}
    >
      <CurrentLayer $progress={verticalProgress} $dragY={dragOffset.y}>
        <Copy>
          <p>오늘 가능한 정도</p>
          <h2>{activePlace?.phrase}</h2>
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
              nudging={index === activeIndex && nudgingCard}
            />
          ))}
        </Carousel>
        <Dots>
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

      {activePlace && verticalProgress > 0 && (
        <TransitionLayer
          $progress={verticalProgress}
          $from={transitionTarget === "detail" ? 34 : -34}
        >
          {transitionTarget === "detail" ? (
            <DetailScreen place={activePlace} onBack={() => undefined} />
          ) : (
            <JournalScreen places={places.slice(0, 3)} onBack={() => undefined} />
          )}
        </TransitionLayer>
      )}
    </Frame>
  );
}

function getOffset(index: number, active: number, length: number) {
  const raw = index - active;
  if (raw > length / 2) return raw - length;
  if (raw < -length / 2) return raw + length;
  return raw;
}

const Frame = styled(ScreenFrame)`
  justify-content: space-between;
  touch-action: none;
`;

const CurrentLayer = styled.div<{ $progress: number; $dragY: number }>`
  position: absolute;
  inset: 44px 24px 28px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  opacity: ${({ $progress }) => 1 - $progress};
  transform: translateY(${({ $dragY }) => $dragY * 0.1}px) scale(${({ $progress }) => 1 - $progress * 0.045});
  transition: ${({ $progress }) =>
    $progress > 0 ? "none" : "opacity 240ms ease, transform 260ms ease"};

  @media (max-width: 520px) {
    inset-inline: 20px;
  }
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

const Copy = styled.div`
  display: grid;
  gap: 8px;

  p {
    color: #777469;
    font-size: 14px;
    line-height: 1.6;
  }

  h2 {
    max-width: 300px;
    min-height: 72px;
    font-size: 27px;
    line-height: 1.28;
    letter-spacing: 0;
  }
`;

const Carousel = styled.div`
  position: relative;
  height: 390px;
  display: grid;
  place-items: center;
  perspective: 900px;

  @media (max-width: 520px) {
    height: 360px;
  }
`;

const Dots = styled.div`
  width: fit-content;
  min-height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0;
  align-self: center;
  padding: 0 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.34);
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
    background: ${({ $active }) => ($active ? "#24271f" : "rgba(31, 33, 29, 0.28)")};
    transition: width 160ms ease, height 160ms ease, background 160ms ease;
  }
`;
