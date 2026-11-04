"use client";

import styled from "@emotion/styled";
import { BaseButton } from "./buttons";

/** Small-trip toast appearance; positioning and lifetime belong to each flow. */
export const ToastSurface = styled.div`
  width: min(100%, 340px); min-width: 0; min-height: 56px;
  display: flex; align-items: center; justify-content: space-between; gap: var(--space-3);
  padding: var(--space-3); border: 1px solid var(--color-border); border-radius: 14px;
  background: rgb(var(--color-white-rgb) / 0.96); color: var(--color-text-muted);
  font-size: var(--ui-caption-size); line-height: var(--line-height-body);
  box-shadow: 0 12px 30px rgb(var(--color-black-rgb) / 0.12); pointer-events: auto;
  > span { flex: 1; min-width: 0; display: grid; gap: 2px; white-space: pre-line; overflow-wrap: anywhere; }
  > svg { flex: none; }
  strong { color: var(--color-text); font-weight: 600; letter-spacing: -0.02em; }
`;

export const ToastAction = styled(BaseButton)`
  min-height: var(--ui-control-height); flex: 0 0 auto; padding: 0 var(--space-3);
  border-radius: 999px; background: var(--color-action-secondary-background); color: var(--color-action-secondary-text);
  font-size: var(--ui-caption-size); font-weight: 600; pointer-events: auto;
  &:focus-visible { outline: 2px solid var(--color-brand-700); outline-offset: -2px; }
`;

export const ToastDismiss = styled(BaseButton)`
  display: grid; place-items: center; flex: none; width: 44px; height: 44px; padding: 0;
  border-radius: 999px; background: transparent; color: var(--color-text-muted);
  &:hover { background: var(--color-neutral-300); }
  &:focus-visible { outline: 2px solid var(--color-brand-700); outline-offset: -2px; }
`;
