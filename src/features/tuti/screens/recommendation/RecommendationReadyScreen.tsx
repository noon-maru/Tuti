"use client";

import { keyframes } from "@emotion/react";
import styled from "@emotion/styled";
import Image from "next/image";
import { PrimaryButton } from "@/features/tuti/components/buttons";
import { ScreenFrame } from "@/features/tuti/components/ScreenFrame";
import { useDeferredAnimationStart } from "@/features/tuti/hooks/useDeferredAnimationStart";

export function RecommendationReadyScreen({
  onOpenRecommendations,
  resolvingLocation = false,
}: {
  onOpenRecommendations: () => void;
  resolvingLocation?: boolean;
}) {
  const animationReady = useDeferredAnimationStart();

  return (
    <Frame data-animation-ready={animationReady}>
      <Hero>
        <BrandMoment data-ready-logo>
          <LogoGlow data-ready-glow aria-hidden="true" />
          <BrandMark
            src="/brand/tuti-symbol.svg"
            alt="Tuti"
            width={96}
            height={96}
            priority
          />
        </BrandMoment>
        <Message data-ready-copy>
          딱 맞는 공기를 찾았어요.
          <br />
          이제 문 밖으로 나가볼까요?
        </Message>
      </Hero>
      <ActionArea data-ready-action>
        <PlaceConfirmationButton
          $resolving={resolvingLocation}
          onClick={onOpenRecommendations}
          disabled={resolvingLocation}
        >
          {resolvingLocation ? "장소를 확인하고 있어요" : "장소 확인하기"}
        </PlaceConfirmationButton>
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
    opacity: 0;
    transform: translateY(8%) scaleY(0.82);
    transform-origin: bottom;
  }

  &[data-animation-ready="true"]::before {
    animation: ${revealBackground} 820ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  &[data-animation-ready="true"] [data-ready-logo] {
    animation: ${revealLogo} 620ms cubic-bezier(0.22, 1, 0.36, 1) 150ms both;
  }

  &[data-animation-ready="true"] [data-ready-glow] {
    animation: ${spreadGlow} 850ms ease-out 200ms both;
  }

  &[data-animation-ready="true"] [data-ready-copy] {
    animation: ${revealContent} 620ms cubic-bezier(0.22, 1, 0.36, 1) 320ms both;
  }

  &[data-animation-ready="true"] [data-ready-action] {
    animation: ${revealContent} 620ms cubic-bezier(0.22, 1, 0.36, 1) 460ms both;
  }

  & > * {
    position: relative;
    z-index: 1;
  }

  @media (prefers-reduced-motion: reduce) {
    &::before,
    [data-ready-logo],
    [data-ready-glow],
    [data-ready-copy],
    [data-ready-action] {
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
  opacity: 0;
  transform: translateY(12px) scale(0.9);
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
  opacity: 0;
  pointer-events: none;
  transform: scale(0.55);
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
  opacity: 0;
  text-align: center;
  transform: translateY(14px);
`;

const ActionArea = styled.div`
  opacity: 0;
  padding: var(--space-5)
    calc(var(--space-5) + var(--app-safe-area-right, 0px))
    calc(var(--space-10) + var(--app-safe-area-bottom, 0px))
    calc(var(--space-5) + var(--app-safe-area-left, 0px));
  transform: translateY(14px);
`;

const PlaceConfirmationButton = styled(PrimaryButton)<{
  $resolving: boolean;
}>`
  width: 100%;
  background: var(--color-secondary-500);
  color: var(--color-text);
  animation: ${({ $resolving }) => ($resolving ? loadingPulse : "none")} 1.6s
    ease-in-out infinite;

  &:hover:not(:disabled) {
    background: var(--color-secondary-600);
  }

  &:disabled {
    background: var(--color-secondary-300);
  }
`;
