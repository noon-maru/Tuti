"use client";

import { keyframes } from "@emotion/react";
import styled from "@emotion/styled";
import { ScreenFrame } from "@/features/tuti/components/ScreenFrame";

export function LoadingIndicator({
  label = "잠시만 기다려주세요.",
  compact = false,
}: {
  label?: string;
  compact?: boolean;
}) {
  return (
    <Indicator
      role="status"
      aria-live="polite"
      aria-label={label || "불러오는 중"}
      $compact={compact}
    >
      <DotSpinner aria-hidden="true" $compact={compact}>
        <i />
        <i />
        <i />
      </DotSpinner>
      {label && <span>{label}</span>}
    </Indicator>
  );
}

export function AppLoadingScreen({
  label = "지금의 상태를 준비하고 있어요.",
}: {
  label?: string;
}) {
  return (
    <LoadingFrame>
      <LoadingIndicator label={label} />
    </LoadingFrame>
  );
}

const firstDotMotion = keyframes`
  0% {
    transform: translate3d(0, calc(var(--dot-wave) * -1), 0);
    animation-timing-function: cubic-bezier(0.45, 0, 0.55, 1);
  }

  36% {
    transform: translate3d(0, 0, 0);
    animation-timing-function: cubic-bezier(0.45, 0, 0.15, 1);
  }

  72%, 100% {
    transform: translate3d(0, calc(var(--dot-wave) * -1), 0);
  }
`;

const middleDotMotion = keyframes`
  0%, 14% {
    transform: translate3d(0, calc(var(--dot-wave) * -1), 0);
    animation-timing-function: cubic-bezier(0.45, 0, 0.55, 1);
  }

  50% {
    transform: translate3d(0, 0, 0);
    animation-timing-function: cubic-bezier(0.45, 0, 0.15, 1);
  }

  86%, 100% {
    transform: translate3d(0, calc(var(--dot-wave) * -1), 0);
  }
`;

const lastDotMotion = keyframes`
  0%, 28% {
    transform: translate3d(0, calc(var(--dot-wave) * -1), 0);
    animation-timing-function: cubic-bezier(0.45, 0, 0.55, 1);
  }

  64% {
    transform: translate3d(0, 0, 0);
    animation-timing-function: cubic-bezier(0.45, 0, 0.15, 1);
  }

  100% {
    transform: translate3d(0, calc(var(--dot-wave) * -1), 0);
  }
`;

const firstDotColor = keyframes`
  0%, 72%, 100% {
    background-color: var(--color-brand-500);
  }

  18%, 54% {
    background-color: var(--color-accent-bridge);
  }

  36% {
    background-color: var(--color-secondary-500);
  }
`;

const middleDotColor = keyframes`
  0%, 14%, 86%, 100% {
    background-color: var(--color-brand-500);
  }

  32%, 68% {
    background-color: var(--color-accent-bridge);
  }

  50% {
    background-color: var(--color-secondary-500);
  }
`;

const lastDotColor = keyframes`
  0%, 28%, 100% {
    background-color: var(--color-brand-500);
  }

  46%, 82% {
    background-color: var(--color-accent-bridge);
  }

  64% {
    background-color: var(--color-secondary-500);
  }
`;

const Indicator = styled.div<{ $compact: boolean }>`
  display: grid;
  justify-items: center;
  gap: ${({ $compact }) =>
    $compact ? "var(--space-2)" : "var(--space-4)"};
  color: var(--color-text-muted);
  font-size: ${({ $compact }) =>
    $compact ? "var(--font-size-100)" : "var(--font-size-200)"};
  text-align: center;
`;

const DotSpinner = styled.span<{ $compact: boolean }>`
  --dot-wave: ${({ $compact }) => ($compact ? "5px" : "8px")};

  display: inline-flex;
  align-items: center;
  gap: ${({ $compact }) => ($compact ? "4px" : "5px")};
  height: ${({ $compact }) => ($compact ? "8px" : "10px")};

  i {
    width: ${({ $compact }) => ($compact ? "6px" : "8px")};
    aspect-ratio: 1;
    transform-origin: center;
    will-change: transform;
  }

  i::before {
    display: block;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    background-color: var(--color-brand-500);
    content: "";
    will-change: background-color;
  }

  i:nth-of-type(1) {
    animation: ${firstDotMotion} 1080ms linear infinite both;
  }

  i:nth-of-type(1)::before {
    animation: ${firstDotColor} 1080ms linear infinite both;
  }

  i:nth-of-type(2) {
    animation: ${middleDotMotion} 1080ms linear infinite both;
  }

  i:nth-of-type(2)::before {
    animation: ${middleDotColor} 1080ms linear infinite both;
  }

  i:nth-of-type(3) {
    animation: ${lastDotMotion} 1080ms linear infinite both;
  }

  i:nth-of-type(3)::before {
    animation: ${lastDotColor} 1080ms linear infinite both;
  }

  @media (prefers-reduced-motion: reduce) {
    i,
    i::before {
      animation: none;
    }

    i:nth-of-type(1)::before {
      background-color: var(--color-secondary-500);
    }

    i:nth-of-type(2)::before {
      background-color: var(--color-accent-bridge);
    }

    i:nth-of-type(3)::before {
      background-color: var(--color-brand-500);
    }
  }
`;

const LoadingFrame = styled(ScreenFrame)`
  z-index: 30;
  display: grid;
  place-items: center;
  background: var(--color-surface);
`;
