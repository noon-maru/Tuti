"use client";

import styled from "@emotion/styled";
import { ScreenFrame } from "@/features/tuti/components/ScreenFrame";
import { SwipeCard } from "@/features/tuti/components/SwipeCard";
import type { TutiPlace } from "@/lib/recommendations";

export type SwipeReturnBackdropProps = {
  places: TutiPlace[];
  activeIndex: number;
  activePlace?: TutiPlace;
};

export function SwipeReturnBackdrop({
  places,
  activeIndex,
  activePlace,
  progress,
}: SwipeReturnBackdropProps & { progress: number }) {
  const place = activePlace ?? places[activeIndex] ?? places[0];

  return (
    <Frame $progress={progress} aria-hidden>
      <Layer>
        <Copy>
          <p>{place?.reason ?? "오늘 가능한 정도"}</p>
          <h2>{place?.phrase}</h2>
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
  inset: 44px 24px 28px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;

  @media (max-width: 520px) {
    inset-inline: 20px;
  }
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
    background: ${({ $active }) => ($active ? "#24271f" : "rgba(31, 33, 29, 0.28)")};
  }
`;
