"use client";

import { keyframes } from "@emotion/react";
import styled from "@emotion/styled";
import Image from "next/image";
import { PrimaryButton } from "@/features/tuti/components/buttons";
import { ScreenFrame } from "@/features/tuti/components/ScreenFrame";

export function HomeScreen({
  onEnterSwipe,
  requestingLocation = false,
}: {
  onEnterSwipe: () => void;
  requestingLocation?: boolean;
}) {
  return (
    <Frame>
      <Hero>
        <BrandMoment data-home-logo>
          <LogoGlow data-home-glow aria-hidden="true" />
          <BrandMark
            src="/favicon.svg"
            alt="Tuti"
            width={96}
            height={96}
            priority
          />
        </BrandMoment>
        <Message data-home-copy>
          딱 맞는 공기를 찾았어요.
          <br />
          이제 문 밖으로 나가볼까요?
        </Message>
      </Hero>
      <ActionArea data-home-action>
        <LocationButton
          $loading={requestingLocation}
          onClick={onEnterSwipe}
          disabled={requestingLocation}
        >
          {requestingLocation ? "장소를 확인하고 있어요" : "장소 확인하기"}
        </LocationButton>
      </ActionArea>
    </Frame>
  );
}

const revealBackground = keyframes`
  from {
    opacity: 0;
    transform: translateY(8%) scaleY(0.82);
  }

  to {
    opacity: 1;
    transform: translateY(0) scaleY(1);
  }
`;

const revealLogo = keyframes`
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.9);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
`;

const spreadGlow = keyframes`
  0% {
    opacity: 0;
    transform: scale(0.55);
  }

  45% {
    opacity: 0.72;
  }

  100% {
    opacity: 0;
    transform: scale(1.45);
  }
`;

const revealContent = keyframes`
  from {
    opacity: 0;
    transform: translateY(14px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const loadingPulse = keyframes`
  0%,
  100% {
    filter: brightness(1);
  }

  50% {
    filter: brightness(1.06);
  }
`;

const Frame = styled(ScreenFrame)`
  --screen-padding-top: 0;
  --screen-padding-right: 0;
  --screen-padding-bottom: 0;
  --screen-padding-left: 0;

  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  background: var(--color-surface);
  isolation: isolate;

  &::before {
    position: absolute;
    z-index: 0;
    inset: 0;
    background: linear-gradient(
      180deg,
      var(--color-surface) 10%,
      var(--color-brand-100) 20%,
      var(--color-brand-500) 58%
    );
    content: "";
    transform-origin: bottom;
    animation: ${revealBackground} 820ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  & > * {
    position: relative;
    z-index: 1;
  }

  @media (prefers-reduced-motion: reduce) {
    &::before,
    [data-home-logo],
    [data-home-glow],
    [data-home-copy],
    [data-home-action] {
      animation-delay: 0ms !important;
    }
  }
`;

const Hero = styled.div`
  display: grid;
  align-content: start;
  justify-items: center;
  gap: var(--space-11);
  min-height: 0;
  padding: clamp(148px, 25vh, 208px) var(--space-6) var(--space-8);
`;

const BrandMoment = styled.div`
  position: relative;
  animation: ${revealLogo} 620ms cubic-bezier(0.22, 1, 0.36, 1) 150ms both;
`;

const LogoGlow = styled.i`
  position: absolute;
  inset: -20px;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    rgb(var(--color-white-rgb) / 0.72) 0%,
    rgb(var(--color-white-rgb) / 0.28) 42%,
    transparent 72%
  );
  pointer-events: none;
  animation: ${spreadGlow} 850ms ease-out 200ms both;
`;

const BrandMark = styled(Image)`
  position: relative;
  width: 96px;
  height: 96px;
`;

const Message = styled.h2`
  color: var(--color-white);
  font-size: var(--font-size-700);
  font-weight: 600;
  line-height: var(--line-height-body);
  text-align: center;
  animation: ${revealContent} 620ms cubic-bezier(0.22, 1, 0.36, 1) 320ms both;
`;

const ActionArea = styled.div`
  padding: var(--space-5)
    calc(var(--space-5) + var(--app-safe-area-right, 0px))
    calc(var(--space-10) + var(--app-safe-area-bottom, 0px))
    calc(var(--space-5) + var(--app-safe-area-left, 0px));
  animation: ${revealContent} 620ms cubic-bezier(0.22, 1, 0.36, 1) 460ms both;
`;

const LocationButton = styled(PrimaryButton)<{ $loading: boolean }>`
  width: 100%;
  background: var(--color-secondary-500);
  color: var(--color-text);
  animation: ${({ $loading }) => ($loading ? loadingPulse : "none")} 1.6s
    ease-in-out infinite;

  &:hover:not(:disabled) {
    background: var(--color-secondary-600);
  }

  &:disabled {
    background: var(--color-secondary-300);
  }
`;
