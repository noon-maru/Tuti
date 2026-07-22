"use client";

import styled from "@emotion/styled";
import { ScreenFrame } from "@/features/tuti/components/ScreenFrame";
import { SwipeCard } from "@/features/tuti/components/SwipeCard";
import type { TutiPlace } from "@/lib/recommendations";

export type RecommendationsBackdropProps = {
  places: TutiPlace[];
  activeIndex: number;
  activePlace?: TutiPlace;
};

export function RecommendationsBackdrop({
  places,
  activeIndex,
  activePlace,
  progress,
}: RecommendationsBackdropProps & { progress: number }) {
  const place = activePlace ?? places[activeIndex] ?? places[0];

  return (
    <Frame $progress={progress} aria-hidden>
      <Layer>
        <Copy>
          <h1>오늘 가능한 정도</h1>
          <p>{place?.reason ?? "지금의 마음에 맞는 장소를 찾고 있어요."}</p>
        </Copy>
        <Carousel>
          {places.map((item, index) => (
            <SwipeCard
              key={item.id}
              cardIndex={index}
              place={item}
              offset={getOffset(index, activeIndex, places.length)}
              active={index === activeIndex}
            />
          ))}
        </Carousel>
        <Dots>
          {places.map((item, index) => (
            <Dot key={item.id} $active={index === activeIndex} />
          ))}
        </Dots>
      </Layer>
    </Frame>
  );
}

function getOffset(index: number, active: number, length: number) {
  const raw = index - active;
  if (raw > length / 2) return raw - length;
  if (raw < -length / 2) return raw + length;
  return raw;
}

const Frame = styled(ScreenFrame)<{ $progress: number }>`
  z-index: 0;
  justify-content: space-between;
  pointer-events: none;
  opacity: ${({ $progress }) => $progress};
  transform: translateY(${({ $progress }) => (1 - $progress) * 22}px)
    scale(${({ $progress }) => 0.97 + $progress * 0.03});
  transition: ${({ $progress }) =>
    $progress > 0 ? "none" : "opacity 180ms ease, transform 200ms ease"};
`;

const Layer = styled.div`
  position: absolute;
  inset: var(--screen-padding-top) var(--screen-padding-right)
    var(--screen-padding-bottom) var(--screen-padding-left);
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
`;

const Copy = styled.div`
  display: grid;
  gap: var(--space-2);
  justify-items: center;
  text-align: center;

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

const Dots = styled.div`
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
`;

const Dot = styled.span<{ $active: boolean }>`
  width: 30px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: 999px;

  &::after {
    content: "";
    width: ${({ $active }) => ($active ? "18px" : "6px")};
    height: 6px;
    border-radius: 999px;
    background: ${({ $active }) =>
      $active ? "var(--color-text)" : "var(--color-border)"};
  }
`;
