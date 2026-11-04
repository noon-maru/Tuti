"use client";

import styled from "@emotion/styled";
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { installDialogScope } from "./dialogScope";

export function AppDialogFrame({ children, titleId, descriptionId, busy = false, initialFocus, onCancel,
  role = "alertdialog", dismissEnabled = true, presentation = "center", closing = false, className,
}: {
  children: ReactNode; titleId: string; descriptionId?: string; busy?: boolean;
  initialFocus?: RefObject<HTMLElement | null>; onCancel: () => void;
  role?: "dialog" | "alertdialog"; dismissEnabled?: boolean;
  presentation?: "center" | "sheet" | "fullscreen"; closing?: boolean; className?: string;
}) {
  const dialog = useRef<HTMLElement>(null);
  const latest = useRef({ onCancel, busy, dismissEnabled, initialFocus });
  useEffect(() => { latest.current = { onCancel, busy, dismissEnabled, initialFocus }; });
  useEffect(() => {
    if (!dialog.current) return;
    return installDialogScope({ dialog: dialog.current,
      initialFocus: () => latest.current.initialFocus?.current ?? null,
      onCancel: () => latest.current.onCancel(),
      canDismiss: () => !latest.current.busy && latest.current.dismissEnabled,
    });
  }, []);
  if (typeof document === "undefined") return null;
  const viewport = document.querySelector<HTMLElement>("[data-app-viewport]");
  return createPortal(<Backdrop $contained={Boolean(viewport)} $sheet={presentation === "sheet"} $fullscreen={presentation === "fullscreen"} $closing={closing}
    onPointerDown={event => { if (event.target === event.currentTarget && !busy && dismissEnabled) onCancel(); }}>
    <Dialog ref={dialog} className={className} $sheet={presentation === "sheet"} $fullscreen={presentation === "fullscreen"} $closing={closing}
      role={role} aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} aria-busy={busy} tabIndex={-1}>{children}</Dialog>
  </Backdrop>, viewport ?? document.body);
}

const Backdrop = styled.div<{ $contained: boolean; $sheet: boolean; $fullscreen: boolean; $closing: boolean }>`position: ${({ $contained }) => $contained ? "absolute" : "fixed"}; inset: 0; z-index: 2147483000; display: grid; place-items: ${({ $sheet }) => $sheet ? "end center" : "center"}; padding: ${({ $fullscreen }) => $fullscreen ? "0" : "max(20px, var(--app-safe-area-top, 0px)) 20px max(20px, var(--app-safe-area-bottom, 0px))"}; background: rgb(27 34 42 / .4); opacity: ${({ $closing }) => $closing ? 0 : 1}; transition: opacity 180ms ease;
  @media (prefers-reduced-motion: reduce) { transition: none; }
`;
const Dialog = styled.section<{ $sheet: boolean; $fullscreen: boolean; $closing: boolean }>`display: grid; gap: 18px; min-width: 0; width: min(100%, ${({ $sheet }) => $sheet ? "430px" : "390px"}); max-height: 100%; overflow-y: auto; overscroll-behavior: contain; padding: 26px 22px 22px; border-radius: 24px; background: var(--color-surface); box-shadow: 0 18px 48px rgb(27 34 42 / .16); outline: none; transform: translateY(${({ $closing, $sheet }) => $closing && $sheet ? "20px" : "0"}); transition: transform 180ms ease;
  ${({ $fullscreen }) => $fullscreen && "width: 100%; height: 100%; border-radius: 0; box-shadow: none;"}
  h2 { margin: 0; font-size: var(--ui-title-size); font-weight: 600; line-height: 1.5; letter-spacing: -.025em; word-break: keep-all; overflow-wrap: anywhere; }
  p { margin: 0; color: var(--color-text-muted); font-size: var(--ui-body-size); line-height: 1.85; white-space: pre-line; word-break: keep-all; overflow-wrap: anywhere; }
  @media (prefers-reduced-motion: reduce) { transition: none; }
`;
