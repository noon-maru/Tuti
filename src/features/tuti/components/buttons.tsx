"use client";

import styled from "@emotion/styled";

export const BaseButton = styled.button`
  border: 0;
  cursor: pointer;
`;

export const PrimaryButton = styled(BaseButton)`
  min-height: var(--space-14);
  border-radius: 999px;
  background: var(--color-accent-primary);
  color: var(--color-white);
  font-weight: 700;
  transition: transform 180ms ease, background 180ms ease;

  &:active {
    transform: scale(0.98);
  }

  &:disabled {
    background: var(--color-border);
    color: var(--color-text-muted);
  }
`;

export const TextButton = styled(BaseButton)`
  width: fit-content;
  justify-self: center;
  padding: var(--space-2) var(--space-4);
  background: transparent;
  color: var(--color-text-muted);
  font-size: var(--font-size-200);
`;

export const SkipButton = styled(TextButton)`
  justify-self: auto;
  padding: 0;
`;

export const BackButton = styled(TextButton)`
  justify-self: auto;
  padding: 0;
`;
