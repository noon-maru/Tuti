"use client";

import { css } from "@emotion/react";
import styled from "@emotion/styled";

export type ButtonTone =
  | "primary"
  | "secondary"
  | "neutral"
  | "text"
  | "danger";
export type ButtonSize = "compact" | "medium" | "large";

type ButtonStyleProps = {
  $tone?: ButtonTone;
  $size?: ButtonSize;
  $fullWidth?: boolean;
};

/**
 * Every element that behaves like a button starts here, including anchors and
 * Next links. Visual components can keep their own layout while sharing the
 * same reset, keyboard focus, disabled state and motion behaviour.
 */
export const baseControlStyles = css`
  box-sizing: border-box;
  border: 0;
  appearance: none;
  font: inherit;
  text-decoration: none;
  -webkit-tap-highlight-color: transparent;
  cursor: pointer;
  touch-action: manipulation;

  &:focus-visible {
    outline: 2px solid var(--color-accent-primary);
    outline-offset: 3px;
  }

  &:disabled,
  &[aria-disabled="true"] {
    cursor: default;
  }

  @media (prefers-reduced-motion: reduce) {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
`;

export const buttonFrameStyles = css`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  border-radius: 999px;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
  transition:
    transform 180ms ease,
    background-color 180ms ease,
    border-color 180ms ease,
    color 180ms ease,
    opacity 180ms ease;

  &:active:not(:disabled):not([aria-disabled="true"]) {
    transform: scale(0.98);
  }
`;

const sizeStyles = ({ $size = "medium" }: ButtonStyleProps) => {
  if ($size === "compact") {
    return css`
      min-height: var(--space-10);
      padding-inline: var(--space-4);
      font-size: var(--font-size-100);
    `;
  }
  if ($size === "large") {
    return css`
      min-height: var(--space-14);
      padding-inline: var(--space-6);
      font-size: var(--font-size-200);
    `;
  }
  return css`
    min-height: var(--space-12);
    padding-inline: var(--space-5);
    font-size: var(--font-size-200);
  `;
};

const toneStyles = ({ $tone = "neutral" }: ButtonStyleProps) => {
  if ($tone === "primary") {
    return css`
      background: var(--color-accent-primary);
      color: var(--color-white);

      &:disabled,
      &[aria-disabled="true"] {
        background: var(--color-border);
        color: var(--color-text-muted);
      }
    `;
  }
  if ($tone === "secondary") {
    return css`
      background: var(--color-secondary-500);
      color: var(--color-text);

      &:disabled,
      &[aria-disabled="true"] {
        opacity: 0.5;
      }
    `;
  }
  if ($tone === "text") {
    return css`
      background: transparent;
      color: var(--color-text-muted);

      &:disabled,
      &[aria-disabled="true"] {
        opacity: 0.5;
      }
    `;
  }
  if ($tone === "danger") {
    return css`
      border: 1px solid var(--color-danger, #c74d4d);
      background: transparent;
      color: var(--color-danger, #c74d4d);

      &:disabled,
      &[aria-disabled="true"] {
        opacity: 0.5;
      }
    `;
  }
  return css`
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text);

    &:disabled,
    &[aria-disabled="true"] {
      opacity: 0.5;
    }
  `;
};

const widthStyles = ({ $fullWidth = false }: ButtonStyleProps) =>
  $fullWidth
    ? css`
        width: 100%;
      `
    : undefined;

export const BaseButton = styled.button`
  ${baseControlStyles}
`;

export const BaseButtonLink = styled.a`
  ${baseControlStyles}
`;

export const Button = styled(BaseButton)<ButtonStyleProps>`
  ${buttonFrameStyles}
  ${sizeStyles}
  ${toneStyles}
  ${widthStyles}
`;

export const ButtonLink = styled(BaseButtonLink)<ButtonStyleProps>`
  ${buttonFrameStyles}
  ${sizeStyles}
  ${toneStyles}
  ${widthStyles}
`;

export const IconButton = styled(BaseButton)<{ $size?: "small" | "medium" }>`
  width: ${({ $size = "medium" }) =>
    $size === "small" ? "var(--space-9)" : "var(--space-11)"};
  height: ${({ $size = "medium" }) =>
    $size === "small" ? "var(--space-9)" : "var(--space-11)"};
  flex: 0 0 auto;
  display: inline-grid;
  place-items: center;
  padding: 0;
  border-radius: 50%;
  background: transparent;
  color: inherit;
`;

export const ChoiceButton = styled(BaseButton)<{ $selected?: boolean }>`
  min-height: var(--space-11);
  padding: var(--space-2) var(--space-4);
  border: 1px solid
    ${({ $selected }) =>
      $selected ? "var(--color-accent-primary)" : "var(--color-border)"};
  border-radius: 999px;
  background: ${({ $selected }) =>
    $selected ? "var(--color-brand-100)" : "var(--color-surface)"};
  color: var(--color-text);
  font-weight: 600;
`;

export const ActionRow = styled(BaseButton)`
  width: 100%;
  min-height: 44px;
  display: flex;
  align-items: center;
  text-align: left;
`;

export const PressableCard = styled(ActionRow)`
  border: 1px solid var(--color-border);
  border-radius: 18px;
  background: var(--color-surface);
`;

export const PrimaryButton = styled(BaseButton)`
  ${buttonFrameStyles}
  min-height: var(--space-14);
  padding-inline: var(--space-6);
  background: var(--color-accent-primary);
  color: var(--color-white);
  font-weight: 700;

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
