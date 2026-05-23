"use client";

import styled from "@emotion/styled";
import { BaseButton } from "@/features/tuti/components/buttons";
import { ScreenFrame } from "@/features/tuti/components/ScreenFrame";
import { SwipeCard } from "@/features/tuti/components/SwipeCard";
import type { TutiPlace } from "@/lib/recommendations";

export function SwipeScreen({
  places,
  activeIndex,
  activePlace,
  onSelect,
  onMove,
  onDetail,
  onGestureStart,
  onGestureEnd,
}: {
  places: TutiPlace[];
  activeIndex: number;
  activePlace?: TutiPlace;
  onSelect: (index: number) => void;
  onMove: (direction: number) => void;
  onDetail: () => void;
  onGestureStart: (point: { x: number; y: number }) => void;
  onGestureEnd: (point: { x: number; y: number }) => void;
}) {
  return (
    <Frame
      onPointerDown={(event) => onGestureStart({ x: event.clientX, y: event.clientY })}
      onPointerUp={(event) => onGestureEnd({ x: event.clientX, y: event.clientY })}
    >
      <Copy>
        <p>오늘 가능한 정도</p>
        <h2>{activePlace?.phrase}</h2>
      </Copy>
      <Carousel>
        {places.map((place, index) => (
          <SwipeCard
            key={place.id}
            place={place}
            offset={getOffset(index, activeIndex, places.length)}
            active={index === activeIndex}
            onClick={() => onSelect(index)}
          />
        ))}
      </Carousel>
      <Dots>
        {places.map((place, index) => (
          <Dot
            key={place.id}
            aria-label={`${index + 1}번째 카드`}
            $active={index === activeIndex}
            onClick={() => onSelect(index)}
          />
        ))}
      </Dots>
      <GestureHints>
        <button onClick={() => onMove(-1)}>이전</button>
        <button onClick={onDetail}>자세히</button>
        <button onClick={() => onMove(1)}>다음</button>
      </GestureHints>
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
  display: flex;
  justify-content: center;
  gap: 10px;
`;

const Dot = styled(BaseButton)<{ $active: boolean }>`
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: ${({ $active }) => ($active ? "#24271f" : "rgba(31, 33, 29, 0.22)")};
`;

const GestureHints = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;

  button {
    min-height: 42px;
    border: 0;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.5);
    color: #68665d;
    cursor: pointer;
  }
`;
