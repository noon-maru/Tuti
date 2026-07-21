"use client";

import styled from "@emotion/styled";
import type { TutiPlace } from "@/lib/recommendations";
import { breakpoints } from "@/styles/tokens";

export function AmbientCard({ place, quiet = false }: { place?: TutiPlace; quiet?: boolean }) {
  return (
    <Frame $image={place?.image} $quiet={quiet}>
      <PlayMark>▷</PlayMark>
    </Frame>
  );
}

const Frame = styled.div<{ $image?: string; $quiet: boolean }>`
  position: relative;
  min-height: ${({ $quiet }) => ($quiet ? "430px" : "360px")};
  overflow: hidden;
  border-radius: 8px;
  background:
    linear-gradient(
      180deg,
      rgb(var(--color-black-rgb) / 0.06),
      rgb(var(--color-black-rgb) / 0.28)
    ),
    ${({ $image }) => ($image ? `url(${$image})` : "var(--color-accent-soft)")};
  background-position: center;
  background-size: cover;
  box-shadow: inset 0 0 0 1px rgb(var(--color-white-rgb) / 0.18);

  &::before {
    content: "";
    position: absolute;
    inset: -20%;
    background: linear-gradient(
      110deg,
      transparent 15%,
      rgb(var(--color-white-rgb) / 0.2) 45%,
      transparent 70%
    );
    animation: lightPass 5.8s ease-in-out infinite;
  }

  @keyframes lightPass {
    0%,
    42% {
      transform: translateX(-48%);
    }

    76%,
    100% {
      transform: translateX(48%);
    }
  }

  @media (max-width: ${breakpoints.mobile}px) {
    min-height: ${({ $quiet }) => ($quiet ? "390px" : "360px")};
  }
`;

const PlayMark = styled.span`
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: rgb(var(--color-white-rgb) / 0.84);
  font-size: var(--font-size-600);
  text-shadow: 0 6px 22px rgb(var(--color-black-rgb) / 0.28);
`;
