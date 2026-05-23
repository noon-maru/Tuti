"use client";

import styled from "@emotion/styled";
import type { TutiPlace } from "@/lib/recommendations";
import { BaseButton } from "./buttons";

export function SwipeCard({
  place,
  offset,
  active,
  onClick,
}: {
  place: TutiPlace;
  offset: number;
  active: boolean;
  onClick: () => void;
}) {
  const hidden = Math.abs(offset) > 2;

  return (
    <CardButton
      $image={place.image}
      $active={active}
      style={{
        transform: `translateX(${offset * 78}px) scale(${active ? 1 : 0.88}) rotate(${offset * -4}deg)`,
        opacity: hidden ? 0 : active ? 1 : 0.56,
        zIndex: 10 - Math.abs(offset),
      }}
      onClick={onClick}
    >
      <span>{place.phrase}</span>
      <small>{place.travelTime}</small>
    </CardButton>
  );
}

const CardButton = styled(BaseButton)<{ $image: string; $active: boolean }>`
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
  transition: transform 360ms ease, opacity 260ms ease;

  &::before {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, transparent 28%, rgba(0, 0, 0, 0.62));
  }

  &:active {
    transform: scale(0.98);
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
