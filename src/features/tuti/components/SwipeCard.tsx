"use client";

import styled from "@emotion/styled";
import type { TutiPlace } from "@/lib/recommendations";
import { BaseButton } from "./buttons";

export function SwipeCard({
  cardIndex,
  place,
  offset,
  active,
  drag,
  nudging,
}: {
  cardIndex: number;
  place: TutiPlace;
  offset: number;
  active: boolean;
  drag?: { x: number; y: number };
  nudging?: "up" | "down" | null;
}) {
  const hidden = Math.abs(offset) > 2;
  const dragX = active ? drag?.x ?? 0 : 0;
  const dragY = active ? drag?.y ?? 0 : 0;
  const baseX = offset * 78;
  const scale = active ? 1 : 0.88;
  const rotation = offset * -4 + dragX / 22;

  return (
    <CardButton
      $image={place.image}
      $active={active}
      $dragging={active && Boolean(drag)}
      $nudging={active ? nudging ?? null : null}
      data-swipe-card-index={cardIndex}
      style={{
        transform: `translate(${baseX + dragX}px, ${dragY}px) scale(${scale}) rotate(${rotation}deg)`,
        opacity: hidden ? 0 : active ? 1 : 0.56,
        zIndex: 10 - Math.abs(offset),
      }}
    >
      <span>{place.phrase}</span>
      <small>{place.travelTime}</small>
    </CardButton>
  );
}

const CardButton = styled(BaseButton)<{
  $image: string;
  $active: boolean;
  $dragging: boolean;
  $nudging: "up" | "down" | null;
}>`
  position: absolute;
  width: 210px;
  height: 330px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 10px;
  padding: 18px;
  overflow: hidden;
  border-radius: 8px;
  background-color: #cad4cb;
  background-image: ${({ $image }) => `url(${$image})`};
  background-position: center;
  background-size: cover;
  color: #fffdf8;
  text-align: left;
  box-shadow: ${({ $active }) =>
    $active ? "0 28px 70px rgba(31, 33, 29, 0.28)" : "0 20px 54px rgba(31, 33, 29, 0.22)"};
  transition: ${({ $dragging }) =>
    $dragging ? "opacity 160ms ease" : "transform 360ms ease, opacity 260ms ease"};
  will-change: transform;
  animation: ${({ $nudging }) =>
    $nudging === "up"
      ? "nudgeUp 520ms ease"
      : $nudging === "down"
        ? "nudgeDown 520ms ease"
        : "none"};

  @keyframes nudgeUp {
    0% {
      translate: 0 0;
    }

    34% {
      translate: 0 -18px;
    }

    62% {
      translate: 0 5px;
    }

    100% {
      translate: 0 0;
    }
  }

  @keyframes nudgeDown {
    0% {
      translate: 0 0;
    }

    34% {
      translate: 0 18px;
    }

    62% {
      translate: 0 -5px;
    }

    100% {
      translate: 0 0;
    }
  }

  &::before {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, transparent 28%, rgba(0, 0, 0, 0.62));
  }

  span,
  small {
    position: relative;
    z-index: 1;
  }

  span {
    font-size: 19px;
    font-weight: 800;
    line-height: 1.35;
  }

  small {
    color: rgba(255, 253, 248, 0.8);
  }
`;
