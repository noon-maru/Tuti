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
    <Indicator role="status" aria-live="polite" $compact={compact}>
      <Spinner aria-hidden="true" $compact={compact} />
      <span>{label}</span>
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

const rotate = keyframes`
  to {
    transform: rotate(360deg);
  }
`;

const breathe = keyframes`
  0%, 100% {
    opacity: 0.52;
  }

  50% {
    opacity: 1;
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

const Spinner = styled.i<{ $compact: boolean }>`
  display: block;
  width: ${({ $compact }) => ($compact ? "24px" : "40px")};
  aspect-ratio: 1;
  border: ${({ $compact }) => ($compact ? "3px" : "4px")} solid
    var(--color-secondary-200);
  border-top-color: var(--color-brand-700);
  border-right-color: var(--color-accent-primary);
  border-radius: 50%;
  animation: ${rotate} 820ms linear infinite;

  @media (prefers-reduced-motion: reduce) {
    animation: ${breathe} 1.2s ease-in-out infinite;
  }
`;

const LoadingFrame = styled(ScreenFrame)`
  z-index: 30;
  display: grid;
  place-items: center;
  background: var(--color-surface);
`;
